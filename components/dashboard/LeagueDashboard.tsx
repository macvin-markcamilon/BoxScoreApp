"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Crown,
  Database,
  Download,
  FileSpreadsheet,
  GitBranch,
  Grid,
  Heart,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  List,
  MapPin,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Shuffle,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
  Tv,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { LeagueGameManagement } from "@/components/dashboard/LeagueGameManagement";
import { GameDetailsWorkspace } from "@/components/dashboard/GameDetailsWorkspace";
import { LeagueTournamentWorkspace } from "@/components/dashboard/LeagueTournamentWorkspace";
import {
  canEditLeagueDetails,
  canManageLeagueRoles,
  canOperateScorebook,
  canOperateGameClock,
  canOperateShotClock,
  getUserLeagueRole,
  BASKETBALL_RULEBOOK_PRESETS,
} from "@/lib/basketball-rules";
import {
  compressImageFile,
  generatePortraitAvatarDataUrl,
  generateRandomCoachingStaff,
  generateRandomTeamRoster,
  parseBulkTeamsInput,
  parseBulkPlayersInput,
} from "@/lib/image-utils";
import { generateUUID } from "@/lib/uuid";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  AssistantCoachMember,
  BracketingFormatId,
  LeagueCategory,
  LeagueCourt,
  LeagueMember,
  LeagueMemberRole,
  LeagueRecord,
  LeagueRulesConfig,
  LeagueTeam,
  PlayerPosition,
  RosterPlayer,
  RuleSetId,
  UserLeagueRole,
  UserProfile,
} from "@/types/boxscore";

const POSITIONS: PlayerPosition[] = ["PG", "SG", "SF", "PF", "C"];

const RULE_SET_OPTIONS: {
  id: RuleSetId;
  shortTitle: string;
  tag: string;
}[] = [
  { id: "FIBA", shortTitle: "FIBA Rules", tag: "4×10m • 24/14s • 5 PF" },
  { id: "NBA", shortTitle: "NBA Rules", tag: "4×12m • 24/14s • 6 PF • Def 3s" },
  { id: "NCAA", shortTitle: "NCAA Rules", tag: "2×20m • 30/20s • 5 PF" },
  { id: "FIBA_3X3", shortTitle: "FIBA 3x3", tag: "1×10m / 21 Pts • 12s Shot" },
  { id: "CUSTOM", shortTitle: "Custom Rules", tag: "Commissioner Configurable" },
];

export function LeagueDashboard() {
  const {
    userProfile,
    leagues,
    followedLeagueIds,
    teams,
    tournamentsByLeagueId,
    selectedLeagueId,
    selectedLeagueTab,
    schemaStatus,
    errorBanner,
    setSelectedLeagueId,
    setSelectedLeagueTab,
    clearError,
    createLeague,
    updateLeague,
    deleteLeague,
    updateLeagueImage,
    toggleFollowLeague,
    createTeamInLeague,
    bulkCreateTeamsInLeague,
    updateTeamInLeague,
    deleteTeamFromLeague,
    updateTeamLogo,
    updateTeamStaffPhoto,
    updateRosterPlayerPhoto,
    updateRosterPlayerJersey,
    revertRosterPlayerToAccount,
    setTeamCaptain,
    addPlayerToExistingTeam,
    bulkAddPlayersToTeam,
    addLeagueMember,
    removeLeagueMember,
    updateLeagueMemberRole,
    addCategoryToLeague,
    updateCategoryInLeague,
    deleteCategoryFromLeague,
    searchRegisteredProfiles,
  } = useBoxScoreStore();

  // Category Management State
  const [newCatName, setNewCatName] = useState("");
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatColor, setNewCatColor] = useState("#0B2F5C");
  const [newCatAgeGroup, setNewCatAgeGroup] = useState("");
  const [newCatRuleSetId, setNewCatRuleSetId] = useState<RuleSetId>("FIBA");
  const [newCatFormatId, setNewCatFormatId] = useState<BracketingFormatId>("MULTI_STAGE");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [catActionNotice, setCatActionNotice] = useState<string | null>(null);

  // Role Management State Modal
  const manageRolesDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isManageRolesOpen, setIsManageRolesOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<LeagueMemberRole>("ADMIN");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberActionNotice, setMemberActionNotice] = useState<string | null>(null);

  // Bulk Upload Teams State Modal
  const bulkUploadDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkParsedTeams, setBulkParsedTeams] = useState<ReturnType<typeof parseBulkTeamsInput>>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [bulkUploadSuccess, setBulkUploadSuccess] = useState<string | null>(null);
  const [isDeletingLeague, setIsDeletingLeague] = useState(false);

  // Unified League Action Hub Modal State
  const leagueActionHubDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isLeagueActionHubOpen, setIsLeagueActionHubOpen] = useState(false);

  // League Rules Inspection Dialog State
  const leagueRulesDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isLeagueRulesOpen, setIsLeagueRulesOpen] = useState(false);

  // Delete League Confirmation Modal with "DELETE" validation State
  const deleteLeagueDialogRef = useRef<HTMLDialogElement | null>(null);
  const [leaguePendingDelete, setLeaguePendingDelete] = useState<LeagueRecord | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk Upload Players State Modal (Per Team)
  const bulkPlayersDialogRef = useRef<HTMLDialogElement | null>(null);
  const [isBulkPlayersOpen, setIsBulkPlayersOpen] = useState(false);
  const [targetBulkPlayerTeamId, setTargetBulkPlayerTeamId] = useState<string | null>(null);
  const [bulkPlayerInputText, setBulkPlayerInputText] = useState("");
  const [bulkParsedPlayers, setBulkParsedPlayers] = useState<RosterPlayer[]>([]);
  const [isBulkUploadingPlayers, setIsBulkUploadingPlayers] = useState(false);
  const [bulkPlayerError, setBulkPlayerError] = useState<string | null>(null);
  const [bulkPlayerSuccess, setBulkPlayerSuccess] = useState<string | null>(null);

  // Teams View Mode (Grid vs List) and Expanded Teams Set
  const [teamViewMode, setTeamViewMode] = useState<"grid" | "list">("grid");
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(() => new Set());

  // Toggle single team expand/collapse
  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  // Expand all or Collapse all
  const expandAllTeams = () => {
    setExpandedTeamIds(new Set(selectedLeagueTeams.map((t) => t.id)));
  };

  const collapseAllTeams = () => {
    setExpandedTeamIds(new Set());
  };

  const [leagueFilterTab, setLeagueFilterTab] = useState<
    "created" | "followed" | "all"
  >("all");
  const [copiedSql, setCopiedSql] = useState(false);

  // Create / Update League Dialog (<dialog closedby="any">)
  const createLeagueDialogRef = useRef<HTMLDialogElement | null>(null);
  const createLeagueTitleId = useId();
  const [, setIsCreateLeagueOpen] = useState(false);
  const [isSavingLeague, setIsSavingLeague] = useState(false);
  const [editingLeagueId, setEditingLeagueId] = useState<string | null>(null);

  // Create League Form State
  const [leagueName, setLeagueName] = useState("");
  const [leagueImageUrl, setLeagueImageUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [courtNameInput, setCourtNameInput] = useState("");
  const [courtAddressInput, setCourtAddressInput] = useState("");
  const [courtSurfaceInput, setCourtSurfaceInput] =
    useState<LeagueCourt["surfaceType"]>("Hardwood");
  const [courtsList, setCourtsList] = useState<LeagueCourt[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<RuleSetId>("FIBA");
  const [rulesConfig, setRulesConfig] = useState<LeagueRulesConfig>(
    BASKETBALL_RULEBOOK_PRESETS.FIBA
  );
  const [formNotice, setFormNotice] = useState<string | null>(null);

  // Create / Update Team Dialog (<dialog closedby="any">)
  const createTeamDialogRef = useRef<HTMLDialogElement | null>(null);
  const createTeamTitleId = useId();
  const [, setIsCreateTeamOpen] = useState(false);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  // If editingTeamId is null -> Creating new team; if string -> Updating existing team
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  // Create / Update Team Form State
  const [teamName, setTeamName] = useState("");
  const [teamImageUrl, setTeamImageUrl] = useState("");
  const [teamCategoryId, setTeamCategoryId] = useState<string>("");
  const [primaryColor, setPrimaryColor] = useState("#8B0D0E");
  const [secondaryColor, setSecondaryColor] = useState("#0B2F5C");

  // Coaching Staff & Manager Form State (with individual photos)
  const [headCoach, setHeadCoach] = useState("");
  const [headCoachImageUrl, setHeadCoachImageUrl] = useState("");
  const [teamManager, setTeamManager] = useState("");
  const [managerImageUrl, setManagerImageUrl] = useState("");
  const [assistantCoachInput, setAssistantCoachInput] = useState("");
  const [assistantCoachImageInput, setAssistantCoachImageInput] = useState("");
  const [assistantCoachStaff, setAssistantCoachStaff] = useState<
    AssistantCoachMember[]
  >([]);

  // Roster & Captain Ball Builder inside Team Modal (with individual player photos & inline editing)
  const [draftFirstName, setDraftFirstName] = useState("");
  const [draftLastName, setDraftLastName] = useState("");
  const [draftJersey, setDraftJersey] = useState("");
  const [draftPosition, setDraftPosition] = useState<PlayerPosition>("PG");
  const [draftPlayerImageUrl, setDraftPlayerImageUrl] = useState("");
  const [draftRoster, setDraftRoster] = useState<RosterPlayer[]>([]);
  const [draftCaptainId, setDraftCaptainId] = useState<string | null>(null);

  // Quick Add Player to Existing Team Card state
  const [quickAddTeamId, setQuickAddTeamId] = useState<string | null>(null);
  const [quickAddMode, setQuickAddMode] = useState<"manual" | "account">("manual");
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [accountSearchResults, setAccountSearchResults] = useState<UserProfile[]>([]);
  const [isSearchingAccounts, setIsSearchingAccounts] = useState(false);
  const [selectedAccountUser, setSelectedAccountUser] = useState<UserProfile | null>(null);
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickJersey, setQuickJersey] = useState("");
  const [quickPos, setQuickPos] = useState<PlayerPosition>("PG");
  const [quickPlayerImageUrl, setQuickPlayerImageUrl] = useState("");
  const [quickIsCaptain, setQuickIsCaptain] = useState(false);

  // Editing Jersey Number inline in Team Card
  const [editingJerseyPlayerId, setEditingJerseyPlayerId] = useState<string | null>(null);
  const [tempJerseyNumber, setTempJerseyNumber] = useState<string>("");

  const selectedLeague: LeagueRecord | null =
    leagues.find((l) => l.id === selectedLeagueId) ?? null;

  // Fallback for <dialog closedby="any"> per modern-web-guidance `light-dismiss-a-dialog`
  useEffect(() => {
    const attachDialogFallback = (
      dialog: HTMLDialogElement | null,
      onCloseCb: () => void
    ) => {
      if (!dialog) return () => {};
      const handleClose = () => onCloseCb();
      dialog.addEventListener("close", handleClose);

      let handleBackdropClick: ((e: MouseEvent) => void) | null = null;
      if (!("closedBy" in HTMLDialogElement.prototype)) {
        handleBackdropClick = (event: MouseEvent) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const inside =
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width;
          if (!inside) dialog.close();
        };
        dialog.addEventListener("click", handleBackdropClick);
      }

      return () => {
        dialog.removeEventListener("close", handleClose);
        if (handleBackdropClick) {
          dialog.removeEventListener("click", handleBackdropClick);
        }
      };
    };

    const cleanLeagueDialog = attachDialogFallback(
      createLeagueDialogRef.current,
      () => setIsCreateLeagueOpen(false)
    );
    const cleanTeamDialog = attachDialogFallback(
      createTeamDialogRef.current,
      () => setIsCreateTeamOpen(false)
    );

    return () => {
      cleanLeagueDialog();
      cleanTeamDialog();
    };
  }, []);

  const resetTeamModalForm = () => {
    setEditingTeamId(null);
    setTeamName("");
    setTeamImageUrl("");
    setTeamCategoryId("");
    setPrimaryColor("#8B0D0E");
    setSecondaryColor("#0B2F5C");
    setHeadCoach("");
    setHeadCoachImageUrl("");
    setAssistantCoachInput("");
    setAssistantCoachImageInput("");
    setAssistantCoachStaff([]);
    setTeamManager("");
    setManagerImageUrl("");
    setDraftFirstName("");
    setDraftLastName("");
    setDraftJersey("");
    setDraftPosition("PG");
    setDraftPlayerImageUrl("");
    setDraftRoster([]);
    setDraftCaptainId(null);
  };

  const resetLeagueModalForm = () => {
    setEditingLeagueId(null);
    setLeagueName("");
    setLeagueImageUrl("");
    setStartDate("");
    setEndDate("");
    setCourtNameInput("");
    setCourtAddressInput("");
    setCourtSurfaceInput("Hardwood");
    setCourtsList([]);
    setSelectedRuleSetId("FIBA");
    setRulesConfig({ ...BASKETBALL_RULEBOOK_PRESETS.FIBA });
  };

  const openCreateLeagueModal = () => {
    resetLeagueModalForm();
    setFormNotice(null);
    setIsCreateLeagueOpen(true);
    if (createLeagueDialogRef.current && !createLeagueDialogRef.current.open) {
      createLeagueDialogRef.current.showModal();
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeague || !newCatName.trim()) return;

    setIsAddingCategory(true);
    setCatActionNotice(null);

    const preset = BASKETBALL_RULEBOOK_PRESETS[newCatRuleSetId] || BASKETBALL_RULEBOOK_PRESETS.FIBA;
    const added = await addCategoryToLeague(selectedLeague.id, {
      name: newCatName.trim(),
      code: newCatCode.trim() || newCatName.trim().slice(0, 3).toUpperCase(),
      color: newCatColor,
      ageGroup: newCatAgeGroup.trim() || undefined,
      ruleSetId: newCatRuleSetId,
      rulesConfig: { ...preset },
      formatId: newCatFormatId,
    });

    setIsAddingCategory(false);
    if (added) {
      setCatActionNotice(`Category "${added.name}" added successfully!`);
      setNewCatName("");
      setNewCatCode("");
      setNewCatAgeGroup("");
    }
  };

  const openManageRolesModal = () => {
    setMemberActionNotice(null);
    setNewMemberEmail("");
    setNewMemberName("");
    setNewMemberRole("ADMIN");
    setIsManageRolesOpen(true);
    if (manageRolesDialogRef.current && !manageRolesDialogRef.current.open) {
      manageRolesDialogRef.current.showModal();
    }
  };

  const closeManageRolesModal = () => {
    setIsManageRolesOpen(false);
    if (manageRolesDialogRef.current?.open) {
      manageRolesDialogRef.current.close();
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeague || !newMemberEmail.trim()) return;

    setIsAddingMember(true);
    setMemberActionNotice(null);

    const result = await addLeagueMember(selectedLeague.id, {
      email: newMemberEmail.trim(),
      displayName: newMemberName.trim(),
      role: newMemberRole,
    });

    setIsAddingMember(false);
    if (result) {
      setMemberActionNotice(
        `Role invitation sent to ${result.displayName || result.email} (${result.role.replace("_", " ")})! They must accept the in-app notification before acquiring permissions.`
      );
      setNewMemberEmail("");
      setNewMemberName("");
    }
  };

  const openBulkUploadModal = () => {
    setBulkUploadError(null);
    setBulkUploadSuccess(null);
    setBulkInputText("");
    setBulkParsedTeams([]);
    setIsBulkUploadOpen(true);
    if (bulkUploadDialogRef.current && !bulkUploadDialogRef.current.open) {
      bulkUploadDialogRef.current.showModal();
    }
  };

  const closeBulkUploadModal = () => {
    setIsBulkUploadOpen(false);
    if (bulkUploadDialogRef.current?.open) {
      bulkUploadDialogRef.current.close();
    }
  };

  const handleParseBulkInput = (text: string) => {
    setBulkInputText(text);
    setBulkUploadError(null);
    setBulkUploadSuccess(null);
    if (!selectedLeague || !text.trim()) {
      setBulkParsedTeams([]);
      return;
    }
    try {
      const parsed = parseBulkTeamsInput(text, selectedLeague.id);
      setBulkParsedTeams(parsed);
      if (parsed.length === 0) {
        setBulkUploadError("No valid teams found. Please check format or header lines.");
      }
    } catch (err: unknown) {
      setBulkUploadError(err instanceof Error ? err.message : "Failed to parse input data.");
    }
  };

  const handleBulkFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || "");
      handleParseBulkInput(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const getSampleTemplateData = (format: "csv" | "json") => {
    const sampleCategory = selectedLeague?.categories?.[0]?.name || "Men";
    if (format === "csv") {
      return (
`Team Name, Primary Color, Secondary Color, Head Coach, Manager, Category, Team Logo URL, Coach Photo URL, Manager Photo URL
Vipers Basketball, #8B0D0E, #0B2F5C, Coach Alex Rivera, Mgr. Sarah Tan, ${sampleCategory}, https://images.unsplash.com/photo-1546519638-68e109498ffc?w=160&auto=format&fit=crop&q=80, https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80, https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80
Blue Hawks, #0B2F5C, #FDB927, Coach Marcus Vance, Mgr. David Lim, ${sampleCategory}, https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=160&auto=format&fit=crop&q=80, https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80, https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=160&auto=format&fit=crop&q=80
Thunderbolts, #F59E0B, #1E293B, Coach Jordan Bell, Mgr. Rachel Cruz, ${sampleCategory}, https://images.unsplash.com/photo-1519766304817-4f37bda74a29?w=160&auto=format&fit=crop&q=80, , 
Apex Warriors, #10B981, #064E3B, Coach Leo Reyes, Mgr. Mark Perez, ${sampleCategory}, , , `
      );
    } else {
      return JSON.stringify(
        [
          {
            name: "Vipers Basketball",
            primaryColor: "#8B0D0E",
            secondaryColor: "#0B2F5C",
            headCoach: "Coach Alex Rivera",
            headCoachImageUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80",
            manager: "Mgr. Sarah Tan",
            managerImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80",
            category: sampleCategory,
            imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=160&auto=format&fit=crop&q=80",
          },
          {
            name: "Blue Hawks",
            primaryColor: "#0B2F5C",
            secondaryColor: "#FDB927",
            headCoach: "Coach Marcus Vance",
            headCoachImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80",
            manager: "Mgr. David Lim",
            managerImageUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=160&auto=format&fit=crop&q=80",
            category: sampleCategory,
            imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=160&auto=format&fit=crop&q=80",
          },
          {
            name: "Thunderbolts",
            primaryColor: "#F59E0B",
            secondaryColor: "#1E293B",
            headCoach: "Coach Jordan Bell",
            manager: "Mgr. Rachel Cruz",
            category: sampleCategory,
            imageUrl: "https://images.unsplash.com/photo-1519766304817-4f37bda74a29?w=160&auto=format&fit=crop&q=80",
          },
        ],
        null,
        2
      );
    }
  };

  const handleDownloadTemplate = (format: "csv" | "json") => {
    const content = getSampleTemplateData(format);
    const mime = format === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const leagueSlug = (selectedLeague?.name || "league").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.download = `teams-template-${leagueSlug}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApplyTemplate = (format: "csv" | "json") => {
    const sample = getSampleTemplateData(format);
    handleParseBulkInput(sample);
  };

  const handleBulkUploadSubmit = async () => {
    if (!selectedLeague || bulkParsedTeams.length === 0) return;
    setIsBulkUploading(true);
    setBulkUploadError(null);
    setBulkUploadSuccess(null);

    try {
      // If team specifies a categoryName, map to existing category ID if matched
      const leagueCategories = selectedLeague.categories || [];
      const teamsPayload = bulkParsedTeams.map((team) => {
        let categoryId: string | undefined = undefined;
        if (team.categoryName) {
          const matched = leagueCategories.find(
            (c) =>
              c.name.trim().toLowerCase() === team.categoryName?.trim().toLowerCase() ||
              c.code.trim().toLowerCase() === team.categoryName?.trim().toLowerCase()
          );
          if (matched) {
            categoryId = matched.id;
          }
        }
        return {
          ...team,
          categoryId,
        };
      });

      const count = await bulkCreateTeamsInLeague(selectedLeague.id, teamsPayload);
      setIsBulkUploading(false);
      setBulkUploadSuccess(`Successfully uploaded and created ${count} teams!`);
      setBulkParsedTeams([]);
      setBulkInputText("");
      setTimeout(() => {
        closeBulkUploadModal();
      }, 1200);
    } catch (err: unknown) {
      setIsBulkUploading(false);
      setBulkUploadError(err instanceof Error ? err.message : "Failed to bulk upload teams.");
    }
  };

  const bulkUploadNoticeSection = () => {
    if (bulkUploadError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {bulkUploadError}
        </div>
      );
    }
    if (bulkUploadSuccess) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
          {bulkUploadSuccess}
        </div>
      );
    }
    return null;
  };

  // Bulk Upload Players Handlers
  const openBulkPlayersModal = (team: LeagueTeam) => {
    setTargetBulkPlayerTeamId(team.id);
    setBulkPlayerError(null);
    setBulkPlayerSuccess(null);
    setBulkPlayerInputText("");
    setBulkParsedPlayers([]);
    setIsBulkPlayersOpen(true);
    if (bulkPlayersDialogRef.current && !bulkPlayersDialogRef.current.open) {
      bulkPlayersDialogRef.current.showModal();
    }
  };

  const closeBulkPlayersModal = () => {
    setIsBulkPlayersOpen(false);
    setTargetBulkPlayerTeamId(null);
    if (bulkPlayersDialogRef.current?.open) {
      bulkPlayersDialogRef.current.close();
    }
  };

  const handleParseBulkPlayers = (text: string, team?: LeagueTeam) => {
    setBulkPlayerInputText(text);
    setBulkPlayerError(null);
    setBulkPlayerSuccess(null);
    if (!text.trim()) {
      setBulkParsedPlayers([]);
      return;
    }
    try {
      const parsed = parseBulkPlayersInput(
        text,
        team?.primaryColor || "#8B0D0E",
        team?.secondaryColor || "#0B2F5C"
      );
      setBulkParsedPlayers(parsed);
      if (parsed.length === 0) {
        setBulkPlayerError("No valid players found in input.");
      }
    } catch (err: unknown) {
      setBulkPlayerError(err instanceof Error ? err.message : "Failed to parse player data.");
    }
  };

  const handleBulkPlayerFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    team?: LeagueTeam
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || "");
      handleParseBulkPlayers(content, team);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const getSamplePlayerTemplate = (format: "csv" | "json") => {
    if (format === "csv") {
      return (
`First Name, Last Name, Jersey, Position, Is Captain, Image URL
Marcus, Smart, 36, PG, true, https://images.unsplash.com/photo-1546519638-68e109498ffc?w=160&auto=format&fit=crop&q=80
Jaylen, Brown, 7, SG, false, https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80
Jayson, Tatum, 0, SF, false, https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80
Al, Horford, 42, C, false, https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=160&auto=format&fit=crop&q=80
Derrick, White, 9, PG, false, `
      );
    } else {
      return JSON.stringify(
        [
          {
            firstName: "Marcus",
            lastName: "Smart",
            jerseyNumber: 36,
            position: "PG",
            isCaptain: true,
            imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=160&auto=format&fit=crop&q=80",
          },
          {
            firstName: "Jaylen",
            lastName: "Brown",
            jerseyNumber: 7,
            position: "SG",
            isCaptain: false,
            imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80",
          },
          {
            firstName: "Jayson",
            lastName: "Tatum",
            jerseyNumber: 0,
            position: "SF",
            isCaptain: false,
            imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80",
          },
        ],
        null,
        2
      );
    }
  };

  const handleDownloadPlayerTemplate = (format: "csv" | "json") => {
    const content = getSamplePlayerTemplate(format);
    const mime = format === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `players-roster-template.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBulkPlayerSubmit = async () => {
    if (!targetBulkPlayerTeamId || bulkParsedPlayers.length === 0) return;
    setIsBulkUploadingPlayers(true);
    setBulkPlayerError(null);
    setBulkPlayerSuccess(null);

    try {
      const count = await bulkAddPlayersToTeam(
        targetBulkPlayerTeamId,
        bulkParsedPlayers
      );
      setIsBulkUploadingPlayers(false);
      setBulkPlayerSuccess(`Successfully added ${count} players to team roster!`);
      setBulkParsedPlayers([]);
      setBulkPlayerInputText("");
      setTimeout(() => {
        closeBulkPlayersModal();
      }, 1200);
    } catch (err: unknown) {
      setIsBulkUploadingPlayers(false);
      setBulkPlayerError(err instanceof Error ? err.message : "Failed to add players.");
    }
  };

  // Open / Close League Action Hub Modal
  const openLeagueActionHub = () => {
    setIsLeagueActionHubOpen(true);
    if (leagueActionHubDialogRef.current && !leagueActionHubDialogRef.current.open) {
      leagueActionHubDialogRef.current.showModal();
    }
  };

  const closeLeagueActionHub = () => {
    setIsLeagueActionHubOpen(false);
    if (leagueActionHubDialogRef.current && leagueActionHubDialogRef.current.open) {
      leagueActionHubDialogRef.current.close();
    }
  };

  // Open / Close Rulebook Inspection Dialog
  const openLeagueRulesModal = () => {
    setIsLeagueRulesOpen(true);
    if (leagueRulesDialogRef.current && !leagueRulesDialogRef.current.open) {
      leagueRulesDialogRef.current.showModal();
    }
  };

  const closeLeagueRulesModal = () => {
    setIsLeagueRulesOpen(false);
    if (leagueRulesDialogRef.current && leagueRulesDialogRef.current.open) {
      leagueRulesDialogRef.current.close();
    }
  };

  // Open / Close Delete League Confirmation with "DELETE" typed check
  const openDeleteLeagueModal = (league: LeagueRecord) => {
    if (league.ownerId !== userProfile?.id) {
      alert("Only the league creator has permission to delete this league.");
      return;
    }
    setLeaguePendingDelete(league);
    setDeleteConfirmationInput("");
    setDeleteError(null);
    closeLeagueActionHub();
    if (deleteLeagueDialogRef.current && !deleteLeagueDialogRef.current.open) {
      deleteLeagueDialogRef.current.showModal();
    }
  };

  const closeDeleteLeagueModal = () => {
    setLeaguePendingDelete(null);
    setDeleteConfirmationInput("");
    setDeleteError(null);
    if (deleteLeagueDialogRef.current && deleteLeagueDialogRef.current.open) {
      deleteLeagueDialogRef.current.close();
    }
  };

  const handleConfirmDeleteLeague = async () => {
    if (!leaguePendingDelete) return;
    if (deleteConfirmationInput.trim() !== "DELETE") {
      setDeleteError("Please type DELETE exactly to confirm deletion.");
      return;
    }

    setIsDeletingLeague(true);
    setDeleteError(null);
    try {
      const success = await deleteLeague(leaguePendingDelete.id);
      if (success) {
        if (selectedLeagueId === leaguePendingDelete.id) {
          setSelectedLeagueId(null);
        }
        closeDeleteLeagueModal();
      } else {
        setDeleteError("Unable to delete league. Please ensure you are signed in as the league creator.");
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete league.");
    } finally {
      setIsDeletingLeague(false);
    }
  };

  const handleDeleteLeague = (league: LeagueRecord) => {
    openDeleteLeagueModal(league);
  };

  const openEditLeagueModal = (league: LeagueRecord) => {
    const role = getUserLeagueRole(league, userProfile?.id, userProfile?.email);
    if (!canEditLeagueDetails(role)) {
      alert("Access Denied: You do not have permission to edit this league. Only the League Creator or League Admins can edit league settings.");
      return;
    }

    setFormNotice(null);
    setEditingLeagueId(league.id);
    setLeagueName(league.name);
    setLeagueImageUrl(league.imageUrl || "");
    setStartDate(league.startDate || "");
    setEndDate(league.endDate || "");
    setCourtsList((league.courts ?? []).map((c) => ({ ...c })));
    setCourtNameInput("");
    setCourtAddressInput("");
    setSelectedRuleSetId(league.ruleSetId || "FIBA");
    setRulesConfig({
      ...(league.rulesConfig ?? BASKETBALL_RULEBOOK_PRESETS[league.ruleSetId || "FIBA"]),
    });
    setIsCreateLeagueOpen(true);
    if (createLeagueDialogRef.current && !createLeagueDialogRef.current.open) {
      createLeagueDialogRef.current.showModal();
    }
  };

  const closeCreateLeagueModal = () => {
    setIsCreateLeagueOpen(false);
    if (createLeagueDialogRef.current?.open) {
      createLeagueDialogRef.current.close();
    }
  };

  const openCreateTeamModal = () => {
    resetTeamModalForm();
    setFormNotice(null);
    setIsCreateTeamOpen(true);
    if (createTeamDialogRef.current && !createTeamDialogRef.current.open) {
      createTeamDialogRef.current.showModal();
    }
  };

  const openEditTeamModal = (team: LeagueTeam) => {
    setFormNotice(null);
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamImageUrl(team.imageUrl || "");
    setTeamCategoryId(team.categoryId || "");
    setPrimaryColor(team.primaryColor || "#8B0D0E");
    setSecondaryColor(team.secondaryColor || "#0B2F5C");
    setHeadCoach(team.headCoach || "");
    setHeadCoachImageUrl(team.headCoachImageUrl || "");
    setTeamManager(team.manager || "");
    setManagerImageUrl(team.managerImageUrl || "");

    const staffList: AssistantCoachMember[] =
      team.assistantCoachStaff && team.assistantCoachStaff.length > 0
        ? team.assistantCoachStaff.map((s) => ({ ...s }))
        : (team.assistantCoaches ?? []).map((name, i) => ({
            id: `${team.id}-ac-${i}`,
            name,
            imageUrl: "",
          }));
    setAssistantCoachStaff(staffList);
    setAssistantCoachInput("");
    setAssistantCoachImageInput("");

    const clonedRoster = (team.roster ?? []).map((p) => ({ ...p }));
    const capId =
      team.captainPlayerId ??
      clonedRoster.find((p) => p.isCaptain)?.id ??
      clonedRoster[0]?.id ??
      null;
    setDraftRoster(
      clonedRoster.map((p) => ({
        ...p,
        isCaptain: p.id === capId,
      }))
    );
    setDraftCaptainId(capId);
    setDraftFirstName("");
    setDraftLastName("");
    setDraftJersey("");
    setDraftPlayerImageUrl("");

    setIsCreateTeamOpen(true);
    if (createTeamDialogRef.current && !createTeamDialogRef.current.open) {
      createTeamDialogRef.current.showModal();
    }
  };

  const closeCreateTeamModal = () => {
    setIsCreateTeamOpen(false);
    if (createTeamDialogRef.current?.open) {
      createTeamDialogRef.current.close();
    }
  };

  // Compressed Image File -> DataURL helper so pictures always save reliably
  const handleImageFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (dataUrl: string) => void | Promise<void>,
    maxDim = 320
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressImageFile(file, maxDim, 0.84);
      await setter(compressedDataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setter(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = "";
    }
  };

  const handleSelectRulePreset = (ruleId: RuleSetId) => {
    setSelectedRuleSetId(ruleId);
    setRulesConfig({ ...BASKETBALL_RULEBOOK_PRESETS[ruleId] });
  };

  const handleAddCourt = () => {
    if (!courtNameInput.trim()) return;
    const newCourt: LeagueCourt = {
      id: generateUUID(),
      name: courtNameInput.trim(),
      address: courtAddressInput.trim() || "Main Tournament Venue",
      surfaceType: courtSurfaceInput,
    };
    setCourtsList((prev) => [...prev, newCourt]);
    setCourtNameInput("");
    setCourtAddressInput("");
  };

  const handleRemoveCourt = (id: string) => {
    setCourtsList((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCreateLeagueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormNotice(null);

    const finalCourts = [...courtsList];
    if (courtNameInput.trim()) {
      finalCourts.push({
        id: generateUUID(),
        name: courtNameInput.trim(),
        address: courtAddressInput.trim() || "Main Tournament Venue",
        surfaceType: courtSurfaceInput,
      });
    }

    if (finalCourts.length === 0) {
      setFormNotice(
        "Please add at least one basketball court to be used for this league."
      );
      return;
    }

    setIsSavingLeague(true);
    const savedLeague = editingLeagueId
      ? await updateLeague(editingLeagueId, {
          name: leagueName,
          imageUrl: leagueImageUrl,
          startDate,
          endDate,
          courts: finalCourts,
          ruleSetId: selectedRuleSetId,
          rulesConfig,
        })
      : await createLeague({
          name: leagueName,
          imageUrl: leagueImageUrl,
          startDate,
          endDate,
          courts: finalCourts,
          ruleSetId: selectedRuleSetId,
          rulesConfig,
        });
    setIsSavingLeague(false);

    if (savedLeague) {
      const wasEditing = Boolean(editingLeagueId);
      resetLeagueModalForm();
      closeCreateLeagueModal();
      if (!wasEditing) {
        setSelectedLeagueId(savedLeague.id);
      }
    }
  };

  // Add Assistant Coach with optional photo to list
  const handleAddAssistantCoach = () => {
    if (!assistantCoachInput.trim()) return;
    const name = assistantCoachInput.trim();
    const newCoach: AssistantCoachMember = {
      id: generateUUID(),
      name,
      imageUrl:
        assistantCoachImageInput ||
        generatePortraitAvatarDataUrl({
          name,
          primaryColor: secondaryColor,
          secondaryColor: primaryColor,
          roleLabel: "ASST COACH",
        }),
    };
    setAssistantCoachStaff((prev) => [...prev, newCoach]);
    setAssistantCoachInput("");
    setAssistantCoachImageInput("");
  };

  const handleUpdateDraftAssistantPhoto = (
    assistantId: string,
    newImageUrl: string
  ) => {
    setAssistantCoachStaff((prev) =>
      prev.map((ac) =>
        ac.id === assistantId ? { ...ac, imageUrl: newImageUrl } : ac
      )
    );
  };

  const handleUpdateDraftAssistantName = (
    assistantId: string,
    newName: string
  ) => {
    setAssistantCoachStaff((prev) =>
      prev.map((ac) => (ac.id === assistantId ? { ...ac, name: newName } : ac))
    );
  };

  // Add Player to Draft Roster in Team Modal (with photo)
  const handleAddDraftPlayer = () => {
    if (!draftFirstName.trim() || !draftLastName.trim()) return;
    const newId = generateUUID();
    const isFirstPlayer = draftRoster.length === 0;
    const nextCaptainId = isFirstPlayer ? newId : draftCaptainId;
    const jerseyNum = Number(draftJersey) || 0;
    const fullName = `${draftFirstName.trim()} ${draftLastName.trim()}`;

    const newPlayer: RosterPlayer = {
      id: newId,
      firstName: draftFirstName.trim(),
      lastName: draftLastName.trim(),
      jerseyNumber: jerseyNum,
      position: draftPosition,
      isCaptain: nextCaptainId === newId,
      imageUrl:
        draftPlayerImageUrl ||
        generatePortraitAvatarDataUrl({
          name: fullName,
          primaryColor,
          secondaryColor,
          badgeText: `#${jerseyNum}`,
          roleLabel: draftPosition,
        }),
    };

    setDraftRoster((prev) => [...prev, newPlayer]);
    if (isFirstPlayer) {
      setDraftCaptainId(newId);
    }
    setDraftFirstName("");
    setDraftLastName("");
    setDraftJersey("");
    setDraftPlayerImageUrl("");
  };

  const handleUpdateDraftPlayerField = (
    playerId: string,
    updates: Partial<RosterPlayer>
  ) => {
    setDraftRoster((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, ...updates } : p))
    );
  };

  const handleUpdateDraftPlayerPhoto = (
    playerId: string,
    newImageUrl: string
  ) => {
    handleUpdateDraftPlayerField(playerId, { imageUrl: newImageUrl });
  };

  const handleSelectDraftCaptain = (playerId: string) => {
    setDraftCaptainId(playerId);
    setDraftRoster((prev) =>
      prev.map((p) => ({
        ...p,
        isCaptain: p.id === playerId,
      }))
    );
  };

  const handleRemoveDraftPlayer = (playerId: string) => {
    const remaining = draftRoster.filter((p) => p.id !== playerId);
    let nextCaptain = draftCaptainId === playerId ? null : draftCaptainId;
    if (!nextCaptain && remaining.length > 0) {
      nextCaptain = remaining[0].id;
    }
    setDraftCaptainId(nextCaptain);
    setDraftRoster(
      remaining.map((p) => ({
        ...p,
        isCaptain: p.id === nextCaptain,
      }))
    );
  };

  // True Random Coaching Staff & 12-Man Team Roster Generators
  const handlePopulateCoachingStaff = () => {
    const randomStaff = generateRandomCoachingStaff({
      primaryColor,
      secondaryColor,
    });
    setHeadCoach(randomStaff.headCoach);
    setHeadCoachImageUrl(randomStaff.headCoachImageUrl);
    setTeamManager(randomStaff.teamManager);
    setManagerImageUrl(randomStaff.managerImageUrl);
    setAssistantCoachStaff(randomStaff.assistantCoachStaff);
    setAssistantCoachInput("");
    setAssistantCoachImageInput("");
  };

  const handlePopulateRoster = () => {
    const { roster, captainId } = generateRandomTeamRoster({
      primaryColor,
      secondaryColor,
      playerCount: 12,
    });
    setDraftRoster(roster);
    setDraftCaptainId(captainId);
    setDraftFirstName("");
    setDraftLastName("");
    setDraftJersey("");
    setDraftPlayerImageUrl("");
  };

  const handlePopulateAllStaffAndRoster = () => {
    handlePopulateCoachingStaff();
    handlePopulateRoster();
  };

  const handleSaveTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeague) return;
    setFormNotice(null);

    let finalRoster = [...draftRoster];
    let finalCaptainId = draftCaptainId;
    if (draftFirstName.trim() && draftLastName.trim()) {
      const autoId = generateUUID();
      if (!finalCaptainId) finalCaptainId = autoId;
      const jerseyNum = Number(draftJersey) || 0;
      finalRoster.push({
        id: autoId,
        firstName: draftFirstName.trim(),
        lastName: draftLastName.trim(),
        jerseyNumber: jerseyNum,
        position: draftPosition,
        isCaptain: finalCaptainId === autoId,
        imageUrl:
          draftPlayerImageUrl ||
          generatePortraitAvatarDataUrl({
            name: `${draftFirstName.trim()} ${draftLastName.trim()}`,
            primaryColor,
            secondaryColor,
            badgeText: `#${jerseyNum}`,
            roleLabel: draftPosition,
          }),
      });
    }

    if (finalRoster.length > 0 && !finalCaptainId) {
      finalCaptainId = finalRoster[0].id;
    }

    finalRoster = finalRoster.map((p) => ({
      ...p,
      isCaptain: p.id === finalCaptainId,
    }));

    const finalAssistantStaff = [...assistantCoachStaff];
    if (assistantCoachInput.trim()) {
      const name = assistantCoachInput.trim();
      finalAssistantStaff.push({
        id: generateUUID(),
        name,
        imageUrl:
          assistantCoachImageInput ||
          generatePortraitAvatarDataUrl({
            name,
            primaryColor: secondaryColor,
            secondaryColor: primaryColor,
            roleLabel: "ASST COACH",
          }),
      });
    }

    const matchedCategory = selectedLeague.categories?.find((c) => c.id === teamCategoryId);
    const payload = {
      leagueId: selectedLeague.id,
      categoryId: teamCategoryId || null,
      categoryName: matchedCategory?.name || undefined,
      name: teamName,
      imageUrl: teamImageUrl,
      primaryColor,
      secondaryColor,
      headCoach,
      headCoachImageUrl:
        headCoachImageUrl ||
        (headCoach.trim()
          ? generatePortraitAvatarDataUrl({
              name: headCoach.trim(),
              primaryColor,
              secondaryColor,
              roleLabel: "HEAD COACH",
            })
          : ""),
      assistantCoaches: finalAssistantStaff.map((ac) => ac.name),
      assistantCoachStaff: finalAssistantStaff,
      manager: teamManager,
      managerImageUrl:
        managerImageUrl ||
        (teamManager.trim()
          ? generatePortraitAvatarDataUrl({
              name: teamManager.trim(),
              primaryColor: secondaryColor,
              secondaryColor: primaryColor,
              roleLabel: "MANAGER",
            })
          : ""),
      captainPlayerId: finalCaptainId,
      roster: finalRoster,
    };

    setIsSavingTeam(true);
    const savedTeam = editingTeamId
      ? await updateTeamInLeague(editingTeamId, payload)
      : await createTeamInLeague(payload);
    setIsSavingTeam(false);

    if (savedTeam) {
      resetTeamModalForm();
      closeCreateTeamModal();
    }
  };

  const handleSearchAccounts = async (query: string) => {
    setAccountSearchQuery(query);
    if (!query.trim()) {
      setAccountSearchResults([]);
      return;
    }
    setIsSearchingAccounts(true);
    try {
      const results = await searchRegisteredProfiles(query);
      setAccountSearchResults(results);
    } finally {
      setIsSearchingAccounts(false);
    }
  };

  const handleSelectAccountForRoster = (user: UserProfile) => {
    setSelectedAccountUser(user);
    setQuickFirstName(user.firstName || "");
    setQuickLastName(user.lastName || "");
    if (user.jerseyNumber !== undefined) {
      setQuickJersey(user.jerseyNumber.toString());
    }
    if (user.positions && user.positions.length > 0) {
      setQuickPos(user.positions[0]);
    }
    if (user.imageUrl) {
      setQuickPlayerImageUrl(user.imageUrl);
    }
  };

  const handleQuickAddPlayerSubmit = async (
    e: React.FormEvent,
    teamId: string,
    teamPrimary: string,
    teamSecondary: string
  ) => {
    e.preventDefault();
    if (!quickFirstName.trim() || !quickLastName.trim()) return;
    const jerseyNum = Number(quickJersey) || 0;
    await addPlayerToExistingTeam(teamId, {
      id: generateUUID(),
      userId: selectedAccountUser?.id,
      firstName: quickFirstName.trim(),
      lastName: quickLastName.trim(),
      jerseyNumber: jerseyNum,
      position: quickPos,
      isCaptain: quickIsCaptain,
      imageUrl:
        quickPlayerImageUrl ||
        generatePortraitAvatarDataUrl({
          name: `${quickFirstName.trim()} ${quickLastName.trim()}`,
          primaryColor: teamPrimary,
          secondaryColor: teamSecondary,
          badgeText: `#${jerseyNum}`,
          roleLabel: quickPos,
        }),
    });
    setQuickFirstName("");
    setQuickLastName("");
    setQuickJersey("");
    setQuickPlayerImageUrl("");
    setQuickIsCaptain(false);
    setSelectedAccountUser(null);
    setAccountSearchQuery("");
    setAccountSearchResults([]);
    setQuickAddMode("manual");
    setQuickAddTeamId(null);
  };

  const copySqlSchemaToClipboard = async () => {
    const sqlText = `-- Paste into Supabase SQL Editor (https://sbqnrxqgahfhbmlevtgf.supabase.co)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  birthday date,
  address text,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  positions text[] not null default '{}',
  account_roles text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles read" on public.profiles for select using (true);
create policy "Self profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "Self profile update" on public.profiles for update using (auth.uid() = id);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '',
  name text not null,
  image_url text,
  start_date date not null,
  end_date date not null,
  courts jsonb not null default '[]'::jsonb,
  rule_set_id text not null default 'FIBA',
  rules_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.leagues enable row level security;
create policy "Public leagues read" on public.leagues for select using (true);
create policy "Auth leagues insert" on public.leagues for insert with check (auth.uid() = owner_id);
create policy "League owners and admins update" on public.leagues for update using (
  auth.uid() = owner_id or
  exists (
    select 1 from public.league_members
    where public.league_members.league_id = public.leagues.id
      and (public.league_members.user_id = auth.uid() or public.league_members.email = auth.jwt()->>'email')
      and public.league_members.role = 'ADMIN'
  )
);

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('ADMIN', 'OFFICIAL_SCORER', 'GAME_TIMER', 'SHOT_CLOCK', 'TABLE_OFFICIAL')),
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_id, email)
);
alter table public.league_members enable row level security;
create policy "Public league members read" on public.league_members for select using (true);
create policy "Owner league members insert" on public.league_members for insert with check (
  exists (select 1 from public.leagues where id = league_id and owner_id = auth.uid())
);
create policy "Owner league members update" on public.league_members for update using (
  exists (select 1 from public.leagues where id = league_id and owner_id = auth.uid())
);
create policy "Owner league members delete" on public.league_members for delete using (
  exists (select 1 from public.leagues where id = league_id and owner_id = auth.uid())
);

create table if not exists public.league_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);
alter table public.league_follows enable row level security;
create policy "Public follows read" on public.league_follows for select using (true);
create policy "Auth follows insert" on public.league_follows for insert with check (auth.uid() = user_id);
create policy "Auth follows delete" on public.league_follows for delete using (auth.uid() = user_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  category_id text,
  category_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text,
  primary_color text not null default '#8B0D0E',
  secondary_color text not null default '#0B2F5C',
  head_coach text not null default '',
  head_coach_image_url text,
  assistant_coaches text[] not null default '{}',
  assistant_coach_staff jsonb not null default '[]'::jsonb,
  manager text not null default '',
  manager_image_url text,
  captain_player_id text,
  roster jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.teams add column if not exists category_id text;
alter table public.teams add column if not exists category_name text;
alter table public.teams enable row level security;
create policy "Public teams read" on public.teams for select using (true);
create policy "Auth teams insert" on public.teams for insert with check (auth.uid() = created_by);
create policy "Auth teams update" on public.teams for update using (auth.uid() = created_by);
create policy "Auth teams delete" on public.teams for delete using (auth.uid() = created_by);`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    }
  };

  const createdLeagues = leagues.filter((l) => l.ownerId === userProfile?.id);
  const followedLeagues = leagues.filter((l) =>
    followedLeagueIds.includes(l.id)
  );
  const displayedLeagues =
    leagueFilterTab === "created"
      ? createdLeagues
      : leagueFilterTab === "followed"
        ? followedLeagues
        : leagues;

  const selectedLeagueTeams = selectedLeague
    ? teams.filter((t) => t.leagueId === selectedLeague.id)
    : [];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* Error Banner */}
      {errorBanner && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-[#8B0D0E]"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={clearError}
            className="underline uppercase"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Database Migration Assistant Notice */}
      {schemaStatus === "missing_tables" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Database
              className="h-5 w-5 shrink-0 text-amber-700 mt-0.5"
              aria-hidden="true"
            />
            <div className="text-xs text-amber-950">
              <strong className="font-black uppercase tracking-wider">
                Supabase Auth Connected • Cloud & Local Image Vault Active:
              </strong>{" "}
              Your account, leagues, followed leagues, teams, coaching staff
              portraits, and roster player headshots are saved automatically. To
              enable shared PostgreSQL relational tables (
              <code>public.leagues</code>, <code>public.teams</code>,{" "}
              <code>public.profiles</code>), run <code>supabase/schema.sql</code>{" "}
              in your Supabase SQL Editor.
            </div>
          </div>
          <button
            type="button"
            onClick={copySqlSchemaToClipboard}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white hover:opacity-95 cursor-pointer"
          >
            {copiedSql ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
                Copied SQL Migration!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy SQL Schema
              </>
            )}
          </button>
        </div>
      )}

      {/* =====================================================================
          VIEW A: SELECTED LEAGUE WORKSPACE (ADD / UPDATE TEAMS, COACHING, ROSTER & CAPTAIN BALL)
         ===================================================================== */}
      {selectedLeague ? (
        <div className="space-y-6">
          {/* Back Bar & League Header */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-white"
              style={{ backgroundColor: "#0B2F5C" }}
            >
              <button
                type="button"
                onClick={() => setSelectedLeagueId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to All Leagues
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleFollowLeague(selectedLeague.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                    followedLeagueIds.includes(selectedLeague.id)
                      ? "bg-rose-600 text-white"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${
                      followedLeagueIds.includes(selectedLeague.id)
                        ? "fill-current"
                        : ""
                    }`}
                    aria-hidden="true"
                  />
                  {followedLeagueIds.includes(selectedLeague.id)
                    ? "Following League"
                    : "Follow League"}
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  {/* League Image / Emblem with 1-Click Upload / Replace */}
                  <div className="relative group shrink-0">
                    {selectedLeague.imageUrl ? (
                      <img
                        src={selectedLeague.imageUrl}
                        alt={selectedLeague.name}
                        width={96}
                        height={96}
                        className="h-24 w-24 rounded-2xl object-cover border-2 border-slate-200 shadow-sm"
                      />
                    ) : (
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-2xl text-2xl font-black uppercase text-white shadow-sm"
                        style={{ backgroundColor: "#8B0D0E" }}
                      >
                        <Trophy className="h-10 w-10" aria-hidden="true" />
                      </div>
                    )}
                    <label
                      title="Upload or change league image"
                      className="absolute -bottom-1.5 -right-1.5 inline-flex items-center gap-1 rounded-lg bg-[#0B2F5C] px-2 py-1 text-[0.62rem] font-black uppercase text-white shadow-md hover:bg-slate-900 cursor-pointer"
                    >
                      <Camera className="h-3 w-3" aria-hidden="true" />
                      Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) =>
                          handleImageFileSelect(
                            e,
                            (url) => updateLeagueImage(selectedLeague.id, url),
                            480
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={openLeagueRulesModal}
                        title="Click to view full Active Rulebook specifications"
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white shadow-2xs hover:opacity-90 cursor-pointer transition-transform active:scale-95"
                        style={{ backgroundColor: "#8B0D0E" }}
                      >
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        {selectedLeague.ruleSetId} RULEBOOK
                      </button>
                      {(() => {
                        const myRole = getUserLeagueRole(
                          selectedLeague,
                          userProfile?.id,
                          userProfile?.email
                        );
                        const roleColor =
                          myRole === "OWNER"
                            ? "bg-amber-500 text-white"
                            : myRole === "ADMIN"
                              ? "bg-blue-600 text-white"
                              : myRole !== "VIEWER"
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-700";
                        const roleLabel =
                          myRole === "OWNER"
                            ? "League Creator / Owner"
                            : myRole === "ADMIN"
                              ? "League Admin"
                              : myRole === "OFFICIAL_SCORER"
                                ? "Official Scorer"
                                : myRole === "GAME_TIMER"
                                  ? "Game Timer"
                                  : myRole === "SHOT_CLOCK"
                                    ? "Shot Clock Operator"
                                    : myRole === "TABLE_OFFICIAL"
                                      ? "Table Official"
                                      : "Viewer / Guest";
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${roleColor}`}
                          >
                            <Shield className="h-3 w-3" />
                            Your Role: {roleLabel}
                          </span>
                        );
                      })()}
                      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase text-slate-500">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {selectedLeague.startDate || "TBD"} →{" "}
                        {selectedLeague.endDate || "TBD"}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        • Organizer: {selectedLeague.ownerName}
                      </span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-900">
                      {selectedLeague.name}
                    </h1>

                    {/* Courts Badges */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {selectedLeague.courts.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700"
                        >
                          <MapPin
                            className="h-3.5 w-3.5 text-[#8B0D0E]"
                            aria-hidden="true"
                          />
                          {c.name} ({c.surfaceType})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Primary CTA: Edit League (Single Action Hub dialog for Manage, Add Team, Delete) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {(() => {
                    const currentRole = getUserLeagueRole(
                      selectedLeague,
                      userProfile?.id,
                      userProfile?.email
                    );
                    const canEdit = canEditLeagueDetails(currentRole);

                    return canEdit ? (
                      <button
                        type="button"
                        onClick={openLeagueActionHub}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[#0B2F5C] shadow-2xs hover:bg-slate-50 cursor-pointer transition-transform active:scale-95"
                      >
                        <Pencil className="h-4 w-4 text-[#0B2F5C]" aria-hidden="true" />
                        Edit League
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Managed League Sub-Navigation Tabs: League Dashboard | Teams | Games Schedule | Bracket */}
              {(() => {
                const currentRole = getUserLeagueRole(
                  selectedLeague,
                  userProfile?.id,
                  userProfile?.email
                );
                const isViewer = currentRole === "VIEWER";
                const canManageGame = canOperateScorebook(currentRole) || canOperateGameClock(currentRole) || canOperateShotClock(currentRole);

                return (
                  <div
                    role="tablist"
                    aria-label={`${selectedLeague.name} Management Sections`}
                    className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedLeagueTab === "league_dashboard"}
                      onClick={() => setSelectedLeagueTab("league_dashboard")}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedLeagueTab === "league_dashboard"
                          ? "bg-[#0B2F5C] text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                      League Dashboard
                    </button>

                    {/* Categories tab: hidden for viewers */}
                    {!isViewer && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedLeagueTab === "categories"}
                        onClick={() => setSelectedLeagueTab("categories")}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          selectedLeagueTab === "categories"
                            ? "bg-[#0B2F5C] text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <Layers className="h-4 w-4 text-amber-500" aria-hidden="true" />
                        Categories ({selectedLeague.categories?.length ?? 0})
                      </button>
                    )}

                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedLeagueTab === "teams"}
                      onClick={() => setSelectedLeagueTab("teams")}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedLeagueTab === "teams"
                          ? "bg-[#0B2F5C] text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Teams ({selectedLeagueTeams.length})
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedLeagueTab === "schedule"}
                      onClick={() => setSelectedLeagueTab("schedule")}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedLeagueTab === "schedule"
                          ? "bg-[#0B2F5C] text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      Games Schedule (
                      {tournamentsByLeagueId[selectedLeague.id]?.matches.length ?? 0}
                      )
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedLeagueTab === "bracket"}
                      onClick={() => setSelectedLeagueTab("bracket")}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                        selectedLeagueTab === "bracket"
                          ? "bg-[#0B2F5C] text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <GitBranch className="h-4 w-4" aria-hidden="true" />
                      Bracket
                    </button>

                    {/* Game Management (Scorebook): only visible to authorized table officials and admins */}
                    {canManageGame && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedLeagueTab === "game_management"}
                        onClick={() => setSelectedLeagueTab("game_management")}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          selectedLeagueTab === "game_management"
                            ? "bg-[#0B2F5C] text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <ClipboardList className="h-4 w-4 text-[#8B0D0E]" aria-hidden="true" />
                        Game Management (Scorebook)
                      </button>
                    )}

                    {/* Game Details: only shown for admins/officials here; viewers reach it by clicking game cards in Games Schedule */}
                    {!isViewer && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selectedLeagueTab === "game_details"}
                        onClick={() => setSelectedLeagueTab("game_details")}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          selectedLeagueTab === "game_details"
                            ? "bg-[#0B2F5C] text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
                        Game Details
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>

          {/* CONDITIONAL TAB WORKSPACE: CATEGORIES vs TEAMS vs GAME MANAGEMENT vs LEAGUE DASHBOARD / GAMES SCHEDULE / BRACKET */}
          {(() => {
            const currentRole = getUserLeagueRole(
              selectedLeague,
              userProfile?.id,
              userProfile?.email
            );
            const isViewer = currentRole === "VIEWER";
            const canManageGame =
              canOperateScorebook(currentRole) ||
              canOperateGameClock(currentRole) ||
              canOperateShotClock(currentRole);

            if (selectedLeagueTab === "categories" && !isViewer) {
              return (
                <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#0B2F5C] px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white">
                      Division &amp; Category Manager
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {selectedLeague.categories?.length ?? 0} Configured Divisions
                    </span>
                  </div>
                  <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-slate-900">
                    League Categories &amp; Custom Rules
                  </h2>
                  <p className="text-xs text-slate-500 max-w-2xl">
                    Configure multiple divisions (e.g. Men&apos;s Open, Women&apos;s Division, Junior U18, Senior 40+). Each category has its own distinct rulebook and bracketing format, and will be automatically interleaved and alternated inside the master tournament schedule.
                  </p>
                </div>
              </div>

              {catActionNotice && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-black uppercase text-emerald-900">
                  {catActionNotice}
                </div>
              )}

              {/* Add New Category Form (Protected for League Creator & Admins) */}
              {(() => {
                const canManageCats = canEditLeagueDetails(
                  getUserLeagueRole(
                    selectedLeague,
                    userProfile?.id,
                    userProfile?.email
                  )
                );
                if (!canManageCats) {
                  return (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs font-bold text-slate-600">
                      Viewing Categories in Read-Only Mode. Contact the League Creator to add or edit categories.
                    </div>
                  );
                }

                return (
                  <form
                    onSubmit={handleAddCategorySubmit}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                        <Plus className="h-4 w-4" />
                        Create New League Category / Division
                      </div>
                      <span className="text-[0.65rem] font-bold uppercase text-slate-400">
                        Independent Format &amp; Rulebook
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Category Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="e.g. Men's Open, Junior U18"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-[#0B2F5C]"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Category Code / Badge
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={newCatCode}
                          onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                          placeholder="e.g. MEN, WMN, JR, SR"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-900 focus:outline-[#0B2F5C]"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Division Color Theme
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newCatColor}
                            onChange={(e) => setNewCatColor(e.target.value)}
                            className="h-8 w-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={newCatColor}
                            onChange={(e) => setNewCatColor(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 uppercase"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Age Group / Eligibility Note
                        </label>
                        <input
                          type="text"
                          value={newCatAgeGroup}
                          onChange={(e) => setNewCatAgeGroup(e.target.value)}
                          placeholder="e.g. Under 18, 40 &amp; Above, Open"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-[#0B2F5C]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Category Rulebook Preset
                        </label>
                        <select
                          value={newCatRuleSetId}
                          onChange={(e) => setNewCatRuleSetId(e.target.value as RuleSetId)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:outline-[#0B2F5C]"
                        >
                          {RULE_SET_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.shortTitle} ({opt.tag})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1">
                          Tournament Bracketing Format
                        </label>
                        <select
                          value={newCatFormatId}
                          onChange={(e) => setNewCatFormatId(e.target.value as BracketingFormatId)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 focus:outline-[#0B2F5C]"
                        >
                          <option value="MULTI_STAGE">Multi-Stage (Group Stage → Playoff Knockout)</option>
                          <option value="SINGLE_ELIMINATION">Single-Elimination (Knockout Tree)</option>
                          <option value="DOUBLE_ELIMINATION">Double-Elimination (Winners &amp; Losers)</option>
                          <option value="ROUND_ROBIN">Round-Robin (Every team plays every opponent)</option>
                          <option value="SERIES_PLAYOFF">Series Playoff (Best-of-3 / Best-of-5)</option>
                          <option value="PAGE_MCINTYRE">Page-McIntyre / Stepladder Climb</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isAddingCategory}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        {isAddingCategory ? "Adding..." : "Add Category to League"}
                      </button>
                    </div>
                  </form>
                );
              })()}

              {/* Existing Categories Cards Grid */}
              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  Active Divisions ({selectedLeague.categories?.length ?? 0})
                </h3>

                {(!selectedLeague.categories || selectedLeague.categories.length === 0) ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center space-y-2">
                    <Layers className="mx-auto h-10 w-10 text-slate-400" />
                    <h4 className="text-base font-black uppercase text-slate-800">
                      No Categories Added Yet
                    </h4>
                    <p className="mx-auto max-w-md text-xs text-slate-500">
                      Add your divisions above (e.g. <strong>Men</strong>, <strong>Women</strong>, <strong>Junior</strong>, <strong>Senior</strong>). Teams can be assigned to a specific category, and matches will alternate automatically in the schedule.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedLeague.categories.map((cat) => {
                      const categoryTeams = teams.filter(
                        (t) => t.categoryId === cat.id
                      );
                      const canManageCats = canEditLeagueDetails(
                        getUserLeagueRole(
                          selectedLeague,
                          userProfile?.id,
                          userProfile?.email
                        )
                      );

                      return (
                        <div
                          key={cat.id}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                          <div className="p-5 space-y-3">
                            <div className="flex items-center justify-between">
                              <span
                                className="rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white"
                                style={{ backgroundColor: cat.color || "#0B2F5C" }}
                              >
                                {cat.code || cat.name}
                              </span>
                              <span className="text-xs font-bold text-slate-500">
                                {categoryTeams.length} Teams
                              </span>
                            </div>

                            <div>
                              <h4 className="text-lg font-black uppercase text-slate-900">
                                {cat.name}
                              </h4>
                              {cat.ageGroup && (
                                <p className="text-xs font-semibold text-slate-500">
                                  Eligibility: {cat.ageGroup}
                                </p>
                              )}
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-[0.72rem] space-y-1">
                              <div className="font-bold text-slate-700">
                                <span className="font-black text-slate-900">Format:</span>{" "}
                                {cat.formatId.replace(/_/g, " ")}
                              </div>
                              <div className="font-bold text-slate-700">
                                <span className="font-black text-slate-900">Rulebook:</span>{" "}
                                {cat.ruleSetId} ({cat.rulesConfig.periodLengthMinutes}m periods, {cat.rulesConfig.shotClockSeconds}s shot clock)
                              </div>
                            </div>
                          </div>

                          {canManageCats && (
                            <div className="border-t border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between">
                              <span className="text-[0.68rem] text-slate-500">
                                Configured for {selectedLeague.name}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteCategoryFromLeague(selectedLeague.id, cat.id)
                                }
                                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
              );
            }

            if (selectedLeagueTab === "teams") {
              return (
                <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                  Registered Teams ({selectedLeagueTeams.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Click <strong>Edit Team</strong> to update team information, or toggle roster views below.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedLeagueTeams.length > 0 && (
                  <>
                    {/* View Switcher: List vs Grid */}
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setTeamViewMode("grid")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          teamViewMode === "grid"
                            ? "bg-white text-[#0B2F5C] shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Grid Card View"
                      >
                        <Grid className="h-3.5 w-3.5" aria-hidden="true" />
                        Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setTeamViewMode("list")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          teamViewMode === "list"
                            ? "bg-white text-[#0B2F5C] shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Compact List View"
                      >
                        <List className="h-3.5 w-3.5" aria-hidden="true" />
                        List
                      </button>
                    </div>

                    {/* Global Expand / Collapse Roster Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        if (expandedTeamIds.size === selectedLeagueTeams.length) {
                          collapseAllTeams();
                        } else {
                          expandAllTeams();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                    >
                      {expandedTeamIds.size === selectedLeagueTeams.length ? (
                        <>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          Collapse All Rosters
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          Expand All Rosters
                        </>
                      )}
                    </button>
                  </>
                )}

                {(() => {
                  const canEdit = canEditLeagueDetails(
                    getUserLeagueRole(
                      selectedLeague,
                      userProfile?.id,
                      userProfile?.email
                    )
                  );
                  if (!canEdit) return null;
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openBulkUploadModal}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        <Upload className="h-4 w-4 text-[#0B2F5C]" aria-hidden="true" />
                        Bulk Upload
                      </button>
                      <button
                        type="button"
                        onClick={openCreateTeamModal}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer shadow-xs"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add Team
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {selectedLeagueTeams.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
                <Shield
                  className="mx-auto h-12 w-12 text-slate-400"
                  aria-hidden="true"
                />
                <h3 className="text-xl font-black uppercase text-slate-800">
                  No Teams Added Yet
                </h3>
                <p className="mx-auto max-w-md text-xs text-slate-500">
                  Click the button below to register your first team with team
                  logo, primary & secondary jersey colors, coaching staff photos,
                  manager, player roster portraits, and Captain Ball selection.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={openCreateTeamModal}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm cursor-pointer"
                    style={{ backgroundColor: "#8B0D0E" }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add First Team to {selectedLeague.name}
                  </button>
                  <button
                    type="button"
                    onClick={openBulkUploadModal}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer"
                  >
                    <Upload className="h-4 w-4 text-[#0B2F5C]" aria-hidden="true" />
                    Bulk Upload Multiple Teams
                  </button>
                </div>
              </div>
            ) : teamViewMode === "list" ? (
              /* =============================================================
                 LIST VIEW: Compact Row Layout with Expandable Roster
                 ============================================================= */
              <div className="space-y-3">
                {selectedLeagueTeams.map((team) => {
                  const isExpanded = expandedTeamIds.has(team.id);
                  const captainPlayer = team.roster.find(
                    (p) => p.id === team.captainPlayerId || p.isCaptain
                  );
                  const assistantStaffList: AssistantCoachMember[] =
                    team.assistantCoachStaff &&
                    team.assistantCoachStaff.length > 0
                      ? team.assistantCoachStaff
                      : team.assistantCoaches.map((name, i) => ({
                          id: `${team.id}-ac-${i}`,
                          name,
                          imageUrl: "",
                        }));

                  return (
                    <article
                      key={team.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:border-slate-300"
                    >
                      {/* Compact List Header Row */}
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-white border-b border-slate-100">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Team Color Accent Bar */}
                          <div
                            className="h-11 w-1.5 rounded-full shrink-0"
                            style={{
                              background: `linear-gradient(180deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)`,
                            }}
                          />

                          {/* Team Logo */}
                          <div className="relative shrink-0">
                            {team.imageUrl ? (
                              <img
                                src={team.imageUrl}
                                alt={team.name}
                                width={44}
                                height={44}
                                className="h-11 w-11 rounded-xl object-contain bg-slate-50 p-1 border border-slate-200 shadow-2xs"
                              />
                            ) : (
                              <div
                                className="flex h-11 w-11 items-center justify-center rounded-xl text-white font-black text-sm shadow-2xs"
                                style={{
                                  background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)`,
                                }}
                              >
                                {team.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>

                          {/* Team Name, Category & Meta */}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black uppercase tracking-tight text-slate-900 truncate">
                                {team.name}
                              </h3>
                              {team.categoryName && (
                                <span className="rounded bg-amber-100 text-amber-900 border border-amber-200/80 px-2 py-0.5 text-[0.62rem] font-black uppercase">
                                  {team.categoryName}
                                </span>
                              )}
                              <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5 text-[0.65rem] font-black uppercase">
                                {team.roster.length} Players
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>
                                <strong>Coach:</strong> {team.headCoach || "TBA"}
                              </span>
                              {team.manager && (
                                <span>
                                  <strong>Manager:</strong> {team.manager}
                                </span>
                              )}
                              {captainPlayer && (
                                <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                                  <Crown className="h-3 w-3 text-amber-500" aria-hidden="true" />
                                  (C) #{captainPlayer.jerseyNumber} {captainPlayer.lastName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* List Row Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {/* Expand / Collapse Roster Button */}
                          <button
                            type="button"
                            onClick={() => toggleTeamExpanded(team.id)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                              isExpanded
                                ? "border-slate-300 bg-slate-100 text-slate-900"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                Hide Players
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                View Players ({team.roster.length})
                              </>
                            )}
                          </button>

                          {(() => {
                            const canEdit = canEditLeagueDetails(
                              getUserLeagueRole(
                                selectedLeague,
                                userProfile?.id,
                                userProfile?.email
                              )
                            );
                            if (!canEdit) return null;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditTeamModal(team)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#0B2F5C] hover:bg-slate-50 cursor-pointer shadow-2xs"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTeamFromLeague(team.id)}
                                  title="Remove team"
                                  aria-label={`Remove ${team.name}`}
                                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Expandable Roster & Staff Section for List View */}
                      {isExpanded && (
                        <div className="bg-slate-50/50">
                          {/* Coaching Staff Strip */}
                          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs sm:grid-cols-3">
                            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5">
                              <img
                                src={
                                  team.headCoachImageUrl ||
                                  generatePortraitAvatarDataUrl({
                                    name: team.headCoach || "HC",
                                    primaryColor: team.primaryColor,
                                    secondaryColor: team.secondaryColor,
                                    roleLabel: "COACH",
                                  })
                                }
                                alt={team.headCoach || "Head Coach"}
                                width={36}
                                height={36}
                                className="h-9 w-9 rounded-lg object-cover border border-slate-200"
                              />
                              <div className="min-w-0">
                                <span className="block text-[0.62rem] font-bold uppercase text-slate-400">
                                  Head Coach
                                </span>
                                <strong className="block truncate font-black text-slate-900">
                                  {team.headCoach || "TBA"}
                                </strong>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5">
                              <img
                                src={
                                  team.managerImageUrl ||
                                  generatePortraitAvatarDataUrl({
                                    name: team.manager || "MGR",
                                    primaryColor: team.secondaryColor,
                                    secondaryColor: team.primaryColor,
                                    roleLabel: "MGR",
                                  })
                                }
                                alt={team.manager || "Team Manager"}
                                width={36}
                                height={36}
                                className="h-9 w-9 rounded-lg object-cover border border-slate-200"
                              />
                              <div className="min-w-0">
                                <span className="block text-[0.62rem] font-bold uppercase text-slate-400">
                                  Team Manager
                                </span>
                                <strong className="block truncate font-black text-slate-900">
                                  {team.manager || "TBA"}
                                </strong>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                              <span className="block text-[0.62rem] font-bold uppercase text-slate-400 mb-1">
                                Assistant Coaches ({assistantStaffList.length})
                              </span>
                              {assistantStaffList.length === 0 ? (
                                <span className="text-slate-400 italic">None listed</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {assistantStaffList.map((ac) => (
                                    <span
                                      key={ac.id}
                                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[0.7rem] font-bold text-slate-800"
                                    >
                                      {ac.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Players List Grid */}
                          <div className="p-5">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                Official Team Roster ({team.roster.length})
                              </span>
                              {(() => {
                                const canEditThisTeam = canEditLeagueDetails(
                                  getUserLeagueRole(
                                    selectedLeague,
                                    userProfile?.id,
                                    userProfile?.email
                                  )
                                );
                                if (!canEditThisTeam) return null;
                                return (
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => openEditTeamModal(team)}
                                      className="inline-flex items-center gap-1 text-xs font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                      Edit Roster / Staff
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openBulkPlayersModal(team)}
                                      className="inline-flex items-center gap-1 text-xs font-black uppercase text-indigo-700 hover:underline cursor-pointer"
                                    >
                                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                                      Bulk Upload
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>

                            {team.roster.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                                No players registered in roster yet.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {team.roster.map((player) => {
                                  const isCap =
                                    player.id === team.captainPlayerId || player.isCaptain;
                                  return (
                                    <div
                                      key={player.id}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-2xs"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <img
                                          src={
                                            player.imageUrl ||
                                            generatePortraitAvatarDataUrl({
                                              name: `${player.firstName} ${player.lastName}`,
                                              primaryColor: team.primaryColor,
                                              secondaryColor: team.secondaryColor,
                                              badgeText: `#${player.jerseyNumber}`,
                                              roleLabel: player.position,
                                            })
                                          }
                                          alt={`${player.firstName} ${player.lastName}`}
                                          width={32}
                                          height={32}
                                          className="h-8 w-8 rounded-lg object-cover border border-slate-200 shrink-0"
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate font-black uppercase text-slate-900">
                                            #{player.jerseyNumber} {player.firstName} {player.lastName}
                                          </div>
                                          <div className="text-[0.65rem] font-bold text-slate-500">
                                            {player.position}
                                          </div>
                                        </div>
                                      </div>

                                      {isCap ? (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[0.65rem] font-black uppercase text-slate-950 shrink-0">
                                          <Crown className="h-3 w-3" aria-hidden="true" />
                                          Captain
                                        </span>
                                      ) : (() => {
                                        const canEditThisTeam = canEditLeagueDetails(
                                          getUserLeagueRole(
                                            selectedLeague,
                                            userProfile?.id,
                                            userProfile?.email
                                          )
                                        );
                                        if (!canEditThisTeam) return null;
                                        return (
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                await revertRosterPlayerToAccount(team.id, player.id);
                                              }}
                                              title="Revert player to account jersey and picture"
                                              className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[0.62rem] font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                                            >
                                              <RotateCcw className="h-2.5 w-2.5" />
                                              Reset
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setTeamCaptain(team.id, player.id)}
                                              className="text-[0.65rem] font-bold text-slate-400 hover:text-amber-600 cursor-pointer"
                                            >
                                              Set Cap
                                            </button>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {selectedLeagueTeams.map((team) => {
                  const captainPlayer = team.roster.find(
                    (p) => p.id === team.captainPlayerId || p.isCaptain
                  );
                  const assistantStaffList: AssistantCoachMember[] =
                    team.assistantCoachStaff &&
                    team.assistantCoachStaff.length > 0
                      ? team.assistantCoachStaff
                      : team.assistantCoaches.map((name, i) => ({
                          id: `${team.id}-ac-${i}`,
                          name,
                          imageUrl: "",
                        }));

                  return (
                    <article
                      key={team.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between"
                    >
                      {/* Team Header with Primary & Secondary Brand Colors */}
                      <div>
                        <div
                          className="p-5 text-white flex flex-wrap items-center justify-between gap-3"
                          style={{
                            background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)`,
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              {team.imageUrl ? (
                                <img
                                  src={team.imageUrl}
                                  alt={team.name}
                                  width={64}
                                  height={64}
                                  className="h-16 w-16 rounded-xl object-cover bg-white p-0.5 shadow-md"
                                />
                              ) : (
                                <div
                                  className="flex h-16 w-16 items-center justify-center rounded-xl text-xl font-black uppercase text-white shadow-md ring-2 ring-white/40"
                                  style={{ backgroundColor: team.primaryColor }}
                                >
                                  {team.name.slice(0, 2)}
                                </div>
                              )}
                              <label
                                title="Upload or change team logo"
                                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/90 text-white shadow hover:bg-slate-800 cursor-pointer"
                              >
                                <Camera
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) =>
                                    handleImageFileSelect(e, (url) =>
                                      updateTeamLogo(team.id, url)
                                    )
                                  }
                                />
                              </label>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                {team.categoryName && (
                                  <span className="rounded bg-amber-400 px-2 py-0.5 text-[0.65rem] font-black uppercase text-slate-950 shadow-xs">
                                    {team.categoryName}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded bg-black/35 px-2 py-0.5 text-[0.65rem] font-black uppercase">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full border border-white"
                                    style={{
                                      backgroundColor: team.primaryColor,
                                    }}
                                  />
                                  <span
                                    className="h-2.5 w-2.5 rounded-full border border-white"
                                    style={{
                                      backgroundColor: team.secondaryColor,
                                    }}
                                  />
                                  Colors
                                </span>
                                <span className="rounded bg-white/20 px-2 py-0.5 text-[0.65rem] font-black uppercase">
                                  {team.roster.length} Players
                                </span>
                              </div>
                              <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">
                                {team.name}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {captainPlayer && (
                              <div className="flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-1.5 text-slate-950 text-right shadow-sm">
                                {captainPlayer.imageUrl && (
                                  <img
                                    src={captainPlayer.imageUrl}
                                    alt={`${captainPlayer.firstName} ${captainPlayer.lastName}`}
                                    width={32}
                                    height={32}
                                    className="h-8 w-8 rounded-lg object-cover border border-slate-950/20"
                                  />
                                )}
                                <div>
                                  <div className="flex items-center justify-end gap-1 text-[0.62rem] font-black uppercase tracking-wider">
                                    <Crown
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    Captain Ball
                                  </div>
                                  <div className="text-xs font-black uppercase">
                                    #{captainPlayer.jerseyNumber}{" "}
                                    {captainPlayer.lastName}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Expand / Collapse Roster Toggle Button */}
                            <button
                              type="button"
                              onClick={() => toggleTeamExpanded(team.id)}
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                                expandedTeamIds.has(team.id)
                                  ? "bg-black/35 text-white hover:bg-black/45"
                                  : "bg-white text-slate-900 shadow-sm hover:bg-slate-100"
                              }`}
                            >
                              {expandedTeamIds.has(team.id) ? (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                  Hide Roster
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                  Roster ({team.roster.length})
                                </>
                              )}
                            </button>

                            {/* Edit / Update Team Button (Protected) */}
                            {(() => {
                              const canEdit = canEditLeagueDetails(
                                getUserLeagueRole(
                                  selectedLeague,
                                  userProfile?.id,
                                  userProfile?.email
                                )
                              );
                              if (!canEdit) return null;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditTeamModal(team)}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-900 shadow-sm hover:bg-white cursor-pointer"
                                  >
                                    <Pencil
                                      className="h-3.5 w-3.5 text-[#0B2F5C]"
                                      aria-hidden="true"
                                    />
                                    Edit Team
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteTeamFromLeague(team.id)}
                                    title="Remove team"
                                    aria-label={`Remove ${team.name}`}
                                    className="inline-flex items-center justify-center rounded-xl bg-black/30 p-2 text-white/90 hover:bg-rose-600 hover:text-white cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Coaching Staff & Manager Info Strip WITH PORTRAITS & PHOTO UPLOAD */}
                        {expandedTeamIds.has(team.id) && (
                        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-xs sm:grid-cols-3">
                          {/* Head Coach Card */}
                          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5">
                            <div className="relative shrink-0">
                              <img
                                src={
                                  team.headCoachImageUrl ||
                                  generatePortraitAvatarDataUrl({
                                    name: team.headCoach || "HC",
                                    primaryColor: team.primaryColor,
                                    secondaryColor: team.secondaryColor,
                                    roleLabel: "COACH",
                                  })
                                }
                                alt={team.headCoach || "Head Coach"}
                                width={42}
                                height={42}
                                className="h-10.5 w-10.5 rounded-xl object-cover border border-slate-200"
                              />
                              <label
                                title="Change Head Coach photo"
                                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0B2F5C] text-white shadow cursor-pointer"
                              >
                                <Camera
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) =>
                                    handleImageFileSelect(e, (url) =>
                                      updateTeamStaffPhoto(
                                        team.id,
                                        "headCoach",
                                        url
                                      )
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[0.62rem] font-bold uppercase text-slate-400">
                                Head Coach
                              </span>
                              <strong className="block truncate font-black text-slate-900">
                                {team.headCoach || "TBA"}
                              </strong>
                            </div>
                          </div>

                          {/* Team Manager Card */}
                          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5">
                            <div className="relative shrink-0">
                              <img
                                src={
                                  team.managerImageUrl ||
                                  generatePortraitAvatarDataUrl({
                                    name: team.manager || "MGR",
                                    primaryColor: team.secondaryColor,
                                    secondaryColor: team.primaryColor,
                                    roleLabel: "MGR",
                                  })
                                }
                                alt={team.manager || "Team Manager"}
                                width={42}
                                height={42}
                                className="h-10.5 w-10.5 rounded-xl object-cover border border-slate-200"
                              />
                              <label
                                title="Change Team Manager photo"
                                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0B2F5C] text-white shadow cursor-pointer"
                              >
                                <Camera
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) =>
                                    handleImageFileSelect(e, (url) =>
                                      updateTeamStaffPhoto(
                                        team.id,
                                        "manager",
                                        url
                                      )
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[0.62rem] font-bold uppercase text-slate-400">
                                Team Manager
                              </span>
                              <strong className="block truncate font-black text-slate-900">
                                {team.manager || "TBA"}
                              </strong>
                            </div>
                          </div>

                          {/* Assistant Coaches Card */}
                          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                            <span className="block text-[0.62rem] font-bold uppercase text-slate-400 mb-1.5">
                              Assistant Coaches ({assistantStaffList.length})
                            </span>
                            {assistantStaffList.length === 0 ? (
                              <span className="text-slate-400 italic">
                                None listed
                              </span>
                            ) : (
                              <div className="space-y-1.5">
                                {assistantStaffList.map((ac) => (
                                  <div
                                    key={ac.id}
                                    className="flex items-center gap-2"
                                  >
                                    <label
                                      title={`Upload photo for ${ac.name}`}
                                      className="relative shrink-0 cursor-pointer"
                                    >
                                      <img
                                        src={
                                          ac.imageUrl ||
                                          generatePortraitAvatarDataUrl({
                                            name: ac.name,
                                            primaryColor: team.primaryColor,
                                            secondaryColor:
                                              team.secondaryColor,
                                          })
                                        }
                                        alt={ac.name}
                                        width={28}
                                        height={28}
                                        className="h-7 w-7 rounded-lg object-cover border border-slate-200"
                                      />
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(e) =>
                                          handleImageFileSelect(e, (url) =>
                                            updateTeamStaffPhoto(
                                              team.id,
                                              "assistant",
                                              url,
                                              ac.id
                                            )
                                          )
                                        }
                                      />
                                    </label>
                                    <span className="truncate font-bold text-slate-800 text-[0.7rem]">
                                      {ac.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        )}

                        {/* Roster Table with Player Portraits & 1-Click Captain Ball Selector */}
                        {expandedTeamIds.has(team.id) && (
                        <div className="p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                              Official Team Roster ({team.roster.length})
                            </span>
                            {(() => {
                              const canEdit = canEditLeagueDetails(
                                getUserLeagueRole(
                                  selectedLeague,
                                  userProfile?.id,
                                  userProfile?.email
                                )
                              );
                              if (!canEdit) return null;
                              return (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEditTeamModal(team)}
                                    className="inline-flex items-center gap-1 text-xs font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer"
                                  >
                                    <Pencil
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    Edit Roster / Staff
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openBulkPlayersModal(team)}
                                    className="inline-flex items-center gap-1 text-xs font-black uppercase text-indigo-700 hover:underline cursor-pointer"
                                  >
                                    <Upload
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    Bulk Upload
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setQuickAddTeamId(
                                        quickAddTeamId === team.id ? null : team.id
                                      )
                                    }
                                    className="inline-flex items-center gap-1 text-xs font-black uppercase text-[#8B0D0E] hover:underline cursor-pointer"
                                  >
                                    <UserPlus
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                    + Add Player
                                  </button>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Quick Add Player Inline Form */}
                          {quickAddTeamId === team.id && (
                            <form
                              onSubmit={(e) =>
                                handleQuickAddPlayerSubmit(
                                  e,
                                  team.id,
                                  team.primaryColor,
                                  team.secondaryColor
                                )
                              }
                              className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3"
                            >
                              {/* Toggle between Manual Entry and Account Search */}
                              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setQuickAddMode("manual")}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase transition-all cursor-pointer ${
                                      quickAddMode === "manual"
                                        ? "bg-[#0B2F5C] text-white"
                                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                    }`}
                                  >
                                    Manual Entry
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setQuickAddMode("account")}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1 ${
                                      quickAddMode === "account"
                                        ? "bg-[#8B0D0E] text-white"
                                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                    }`}
                                  >
                                    <Search className="h-3 w-3" />
                                    Search App Account
                                  </button>
                                </div>

                                {selectedAccountUser && (
                                  <span className="flex items-center gap-1 text-[0.68rem] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <Check className="h-3 w-3" />
                                    Linked: {selectedAccountUser.email}
                                  </span>
                                )}
                              </div>

                              {/* Search by Account in the App */}
                              {quickAddMode === "account" && (
                                <div className="space-y-2 rounded-xl bg-white p-3 border border-slate-200">
                                  <label className="block text-[0.68rem] font-black uppercase text-slate-600">
                                    Search Registered User by Name or Email
                                  </label>
                                  <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder="Type name (e.g. LeBron) or user@email.com..."
                                      value={accountSearchQuery}
                                      onChange={(e) => handleSearchAccounts(e.target.value)}
                                      className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B2F5C] focus:outline-none"
                                    />
                                    {isSearchingAccounts && (
                                      <span className="absolute right-3 top-2 text-[0.65rem] font-bold text-slate-400">
                                        Searching...
                                      </span>
                                    )}
                                  </div>

                                  {accountSearchResults.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50">
                                      {accountSearchResults.map((u) => {
                                        const isSelected = selectedAccountUser?.id === u.id;
                                        return (
                                          <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => handleSelectAccountForRoster(u)}
                                            className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer ${
                                              isSelected ? "bg-amber-50/80 font-bold" : ""
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="h-7 w-7 rounded-full bg-[#0B2F5C] text-white flex items-center justify-center text-xs font-black shrink-0">
                                                {u.firstName?.[0] || u.email[0].toUpperCase()}
                                              </div>
                                              <div>
                                                <div className="text-xs font-black text-slate-900">
                                                  {u.firstName} {u.lastName}
                                                </div>
                                                <div className="text-[0.65rem] text-slate-500">
                                                  {u.email}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              {u.positions && u.positions.length > 0 && (
                                                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[0.6rem] font-bold text-slate-700">
                                                  {u.positions.join("/")}
                                                </span>
                                              )}
                                              <span className="rounded-md bg-[#8B0D0E] px-2 py-0.5 text-[0.65rem] font-black text-white">
                                                Select
                                              </span>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {accountSearchQuery && !isSearchingAccounts && accountSearchResults.length === 0 && (
                                    <p className="text-[0.7rem] text-slate-400 italic">
                                      No accounts found matching &quot;{accountSearchQuery}&quot;. You can enter player details manually below.
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                <input
                                  type="text"
                                  required
                                  placeholder="First Name"
                                  value={quickFirstName}
                                  onChange={(e) =>
                                    setQuickFirstName(e.target.value)
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                                />
                                <input
                                  type="text"
                                  required
                                  placeholder="Last Name"
                                  value={quickLastName}
                                  onChange={(e) =>
                                    setQuickLastName(e.target.value)
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  required
                                  placeholder="Jersey #"
                                  value={quickJersey}
                                  onChange={(e) =>
                                    setQuickJersey(e.target.value)
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-black text-slate-900"
                                />
                                <select
                                  value={quickPos}
                                  onChange={(e) =>
                                    setQuickPos(
                                      e.target.value as PlayerPosition
                                    )
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-black text-slate-900"
                                >
                                  {POSITIONS.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                                <label className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-black uppercase text-[#0B2F5C] cursor-pointer">
                                  {quickPlayerImageUrl ? (
                                    <img
                                      src={quickPlayerImageUrl}
                                      alt="Player preview"
                                      className="h-5 w-5 rounded-full object-cover"
                                    />
                                  ) : (
                                    <Camera className="h-3.5 w-3.5" />
                                  )}
                                  Photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) =>
                                      handleImageFileSelect(
                                        e,
                                        setQuickPlayerImageUrl
                                      )
                                    }
                                  />
                                </label>
                              </div>
                              <div className="flex items-center justify-between">
                                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={quickIsCaptain}
                                    onChange={(e) =>
                                      setQuickIsCaptain(e.target.checked)
                                    }
                                    className="h-4 w-4 rounded"
                                  />
                                  Assign as Captain Ball
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-lg bg-[#8B0D0E] px-3 py-1.5 text-xs font-black uppercase text-white cursor-pointer"
                                >
                                  Save Player
                                </button>
                              </div>
                            </form>
                          )}

                          {team.roster.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-3">
                              No players listed yet. Click &ldquo;Edit
                              Team&rdquo; or &ldquo;+ Add Player&rdquo; above to
                              populate this roster.
                            </p>
                          ) : (
                            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                              {team.roster.map((player) => {
                                const isCap =
                                  team.captainPlayerId === player.id ||
                                  player.isCaptain;
                                const avatarSrc =
                                  player.imageUrl ||
                                  generatePortraitAvatarDataUrl({
                                    name: `${player.firstName} ${player.lastName}`,
                                    primaryColor: team.primaryColor,
                                    secondaryColor: team.secondaryColor,
                                    badgeText: `#${player.jerseyNumber}`,
                                    roleLabel: player.position,
                                  });

                                return (
                                  <div
                                    key={player.id}
                                    className={`flex items-center justify-between px-3.5 py-2.5 text-xs ${
                                      isCap ? "bg-amber-50/70" : "bg-white"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      {/* Player Headshot with 1-Click Upload */}
                                      <label
                                        title={`Upload photo for ${player.firstName} ${player.lastName}`}
                                        className="relative shrink-0 cursor-pointer group"
                                      >
                                        <img
                                          src={avatarSrc}
                                          alt={`${player.firstName} ${player.lastName}`}
                                          width={38}
                                          height={38}
                                          className="h-9.5 w-9.5 rounded-xl object-cover border border-slate-200 shadow-2xs"
                                        />
                                        <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-900 text-white shadow group-hover:bg-[#8B0D0E] transition-colors">
                                          <Camera
                                            className="h-2.5 w-2.5"
                                            aria-hidden="true"
                                          />
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="sr-only"
                                          onChange={(e) =>
                                            handleImageFileSelect(e, (url) =>
                                              updateRosterPlayerPhoto(
                                                team.id,
                                                player.id,
                                                url
                                              )
                                            )
                                          }
                                        />
                                      </label>

                                      {/* Editable Jersey Number */}
                                      {editingJerseyPlayerId === player.id ? (
                                        <input
                                          type="number"
                                          min={0}
                                          max={99}
                                          autoFocus
                                          value={tempJerseyNumber}
                                          onChange={(e) => setTempJerseyNumber(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const val = Number(tempJerseyNumber);
                                              if (!isNaN(val)) {
                                                updateRosterPlayerJersey(team.id, player.id, val);
                                              }
                                              setEditingJerseyPlayerId(null);
                                            } else if (e.key === "Escape") {
                                              setEditingJerseyPlayerId(null);
                                            }
                                          }}
                                          onBlur={() => {
                                            const val = Number(tempJerseyNumber);
                                            if (!isNaN(val) && tempJerseyNumber.trim() !== "") {
                                              updateRosterPlayerJersey(team.id, player.id, val);
                                            }
                                            setEditingJerseyPlayerId(null);
                                          }}
                                          className="h-7 w-12 rounded-md border border-slate-300 px-1 text-center font-black text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingJerseyPlayerId(player.id);
                                            setTempJerseyNumber(String(player.jerseyNumber));
                                          }}
                                          title="Click to edit jersey number"
                                          className="inline-flex h-7 w-8 items-center justify-center rounded-md font-black text-white tabular-nums hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                                          style={{
                                            backgroundColor: team.primaryColor,
                                          }}
                                        >
                                          #{player.jerseyNumber}
                                        </button>
                                      )}

                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-black uppercase text-slate-900">
                                            {player.firstName} {player.lastName}
                                          </span>
                                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-black text-slate-700">
                                            {player.position}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {/* Revert back to user account jersey & photo */}
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await revertRosterPlayerToAccount(team.id, player.id);
                                        }}
                                        title="Revert back to account's default jersey number and profile picture"
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[0.68rem] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                                      >
                                        <RotateCcw className="h-3 w-3 text-slate-400" />
                                        Reset
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setTeamCaptain(team.id, player.id)
                                        }
                                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.68rem] font-black uppercase transition-colors cursor-pointer ${
                                          isCap
                                            ? "bg-amber-400 text-slate-950 shadow-2xs"
                                            : "border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-slate-900"
                                        }`}
                                      >
                                        <Crown
                                          className="h-3 w-3"
                                          aria-hidden="true"
                                        />
                                        {isCap ? "Captain Ball (C)" : "Set Captain"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
              );
            }

            if (selectedLeagueTab === "game_management") {
              if (!canManageGame) {
                // If viewer lands here, fallback to schedule
                return (
                  <LeagueTournamentWorkspace
                    league={selectedLeague}
                    teams={selectedLeagueTeams}
                    activeTab="schedule"
                    onSwitchTab={setSelectedLeagueTab}
                    onEditLeague={() => openEditLeagueModal(selectedLeague)}
                  />
                );
              }
              return (
                <LeagueGameManagement
                  league={selectedLeague}
                  teams={selectedLeagueTeams}
                  onSwitchTab={setSelectedLeagueTab}
                />
              );
            }

            if (selectedLeagueTab === "game_details") {
              return (
                <GameDetailsWorkspace
                  league={selectedLeague}
                  teams={selectedLeagueTeams}
                  onSwitchTab={setSelectedLeagueTab}
                />
              );
            }

            return (
              <LeagueTournamentWorkspace
                league={selectedLeague}
                teams={selectedLeagueTeams}
                activeTab={selectedLeagueTab}
                onSwitchTab={setSelectedLeagueTab}
                onEditLeague={() => openEditLeagueModal(selectedLeague)}
              />
            );
          })()}
        </div>
      ) : (
        /* =====================================================================
           VIEW B: MAIN LEAGUE PAGE (CREATED LEAGUES, FOLLOWED LEAGUES & CREATE LEAGUE CTA)
           ===================================================================== */
        <div className="space-y-6">
          {/* Top League Page Header */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white"
                  style={{ backgroundColor: "#0B2F5C" }}
                >
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  Official League Hub
                </span>
                <h1 className="mt-2 text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-900">
                  Created & Followed Basketball Leagues
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Create custom leagues with official FIBA, NBA, NCAA, or 3x3
                  rules, assign courts, follow tournaments, and register team
                  rosters.
                </p>
              </div>

              <button
                type="button"
                onClick={openCreateLeagueModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-md hover:opacity-95 cursor-pointer transition-transform active:scale-95"
                style={{ backgroundColor: "#8B0D0E" }}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                Create a League
              </button>
            </div>

            {/* Filter Tabs: Created Leagues | Followed Leagues | All Leagues */}
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setLeagueFilterTab("created")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  leagueFilterTab === "created"
                    ? "bg-[#0B2F5C] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                My Created Leagues ({createdLeagues.length})
              </button>

              <button
                type="button"
                onClick={() => setLeagueFilterTab("followed")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  leagueFilterTab === "followed"
                    ? "bg-[#8B0D0E] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                Followed Leagues ({followedLeagues.length})
              </button>

              <button
                type="button"
                onClick={() => setLeagueFilterTab("all")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  leagueFilterTab === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Leagues ({leagues.length})
              </button>
            </div>
          </section>

          {/* Leagues Grid */}
          {displayedLeagues.length === 0 ? (
            <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
              <Trophy
                className="mx-auto h-12 w-12 text-slate-400"
                aria-hidden="true"
              />
              <h2 className="text-xl font-black uppercase text-slate-800">
                {leagueFilterTab === "created"
                  ? "You Haven't Created a League Yet"
                  : leagueFilterTab === "followed"
                    ? "You Aren't Following Any Leagues Yet"
                    : "No Leagues Registered Yet"}
              </h2>
              <p className="mx-auto max-w-md text-xs text-slate-500 leading-relaxed">
                {leagueFilterTab === "followed"
                  ? "Browse All Leagues or create a new league and click the Follow heart button to pin it here."
                  : "Launch your first basketball tournament by configuring the league name, cover image, dates, courts, and official rulebook (FIBA, NBA, NCAA, or 3x3)."}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={openCreateLeagueModal}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm cursor-pointer"
                  style={{ backgroundColor: "#8B0D0E" }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create Your First League
                </button>
              </div>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {displayedLeagues.map((lg) => {
                const isFollowing = followedLeagueIds.includes(lg.id);
                const lgTeamsCount = teams.filter(
                  (t) => t.leagueId === lg.id
                ).length;

                return (
                  <article
                    key={lg.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs hover:shadow-md transition-shadow"
                  >
                    <div>
                      {/* League Cover / Banner */}
                      <div
                        className="relative h-40 w-full flex items-end p-4 text-white"
                        style={{
                          background: lg.imageUrl
                            ? `linear-gradient(to top, rgba(2,6,23,0.85), rgba(2,6,23,0.2)), url(${lg.imageUrl}) center/cover no-repeat`
                            : "linear-gradient(135deg, #0B2F5C 0%, #8B0D0E 100%)",
                        }}
                      >
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className="rounded-md bg-[#8B0D0E] px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider text-white shadow-xs">
                            {lg.ruleSetId} Rules
                          </span>
                          <span className="rounded-md bg-slate-950/75 px-2.5 py-1 text-[0.68rem] font-black uppercase text-amber-300">
                            {lgTeamsCount} Teams
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFollowLeague(lg.id)}
                          aria-label={
                            isFollowing ? "Unfollow league" : "Follow league"
                          }
                          className={`absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.68rem] font-black uppercase transition-colors cursor-pointer ${
                            isFollowing
                              ? "bg-rose-600 text-white"
                              : "bg-slate-950/70 text-white hover:bg-slate-950"
                          }`}
                        >
                          <Heart
                            className={`h-3.5 w-3.5 ${
                              isFollowing ? "fill-current" : ""
                            }`}
                            aria-hidden="true"
                          />
                          {isFollowing ? "Following" : "Follow"}
                        </button>

                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">
                            {lg.name}
                          </h3>
                          <p className="text-xs font-bold text-slate-200">
                            Organizer: {lg.ownerName}
                          </p>
                        </div>
                      </div>

                      {/* League Metadata */}
                      <div className="p-5 space-y-3 text-xs">
                        <div className="flex items-center gap-2 font-bold text-slate-700">
                          <Calendar
                            className="h-4 w-4 text-[#0B2F5C] shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            {lg.startDate} to {lg.endDate}
                          </span>
                        </div>

                        <div className="flex items-start gap-2 text-slate-600">
                          <MapPin
                            className="h-4 w-4 text-[#8B0D0E] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <div>
                            <strong className="font-black uppercase text-slate-800">
                              Courts ({lg.courts.length}):{" "}
                            </strong>
                            {lg.courts.map((c) => c.name).join(", ")}
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80 space-y-1">
                          <div className="font-black uppercase text-[#0B2F5C]">
                            {lg.rulesConfig.ruleSetName}
                          </div>
                          <div className="text-[0.7rem] font-semibold text-slate-600">
                            {lg.rulesConfig.periodsCount} ×{" "}
                            {lg.rulesConfig.periodLengthMinutes}m •{" "}
                            {lg.rulesConfig.shotClockSeconds}s Shot Clock •{" "}
                            {lg.rulesConfig.personalFoulLimit} PF Limit • Bonus
                            on {lg.rulesConfig.teamFoulBonusThreshold}th Foul
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 bg-slate-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">
                        {lgTeamsCount} Registered{" "}
                        {lgTeamsCount === 1 ? "Team" : "Teams"}
                      </span>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const lgRole = getUserLeagueRole(
                            lg,
                            userProfile?.id,
                            userProfile?.email
                          );
                          const canEditThisLeague = canEditLeagueDetails(lgRole);
                          const isLeagueCreator = lg.ownerId === userProfile?.id;
                          return (
                            <>
                              {isLeagueCreator && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLeague(lg)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100 cursor-pointer"
                                  title="Delete League (Creator only)"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                                  Delete
                                </button>
                              )}
                              {canEditThisLeague && (
                                <button
                                  type="button"
                                  onClick={() => openEditLeagueModal(lg)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wider text-[#0B2F5C] hover:bg-slate-100 cursor-pointer"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedLeagueId(lg.id)}
                                className="rounded-xl bg-[#0B2F5C] px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:opacity-95 cursor-pointer"
                              >
                                {canEditThisLeague ? "Manage & Add Teams →" : "View League →"}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREATE OR EDIT A LEAGUE (<dialog closedby="any">)
         ===================================================================== */}
      <dialog
        ref={createLeagueDialogRef}
        aria-labelledby={createLeagueTitleId}
        {...({ closedby: "any" } as Record<string, string>)}
        className="m-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl overflow-hidden"
      >
        <div
          className="flex items-center justify-between px-6 py-4 text-white"
          style={{
            backgroundColor: editingLeagueId ? "#8B0D0E" : "#0B2F5C",
          }}
        >
          <div>
            <h2
              id={createLeagueTitleId}
              className="text-xl font-black uppercase tracking-tight"
            >
              {editingLeagueId
                ? `Edit League: ${leagueName || "Tournament"}`
                : "Create a Basketball League"}
            </h2>
            <p className="text-xs text-slate-200">
              {editingLeagueId
                ? "Update league name, banner image, tournament dates, courts, and official rulebook configuration"
                : "Configure league identity, dates, courts, and official rulebook (FIBA, NBA, NCAA, 3x3, or Custom)"}
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateLeagueModal}
            aria-label="Close league modal"
            className="rounded-lg p-1.5 text-slate-200 hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form
          method="POST"
          onSubmit={handleCreateLeagueSubmit}
          className="max-h-[82vh] overflow-y-auto p-6 space-y-6"
        >
          {formNotice && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-[#8B0D0E]"
            >
              {formNotice}
            </div>
          )}

          {/* 1. League Name & League Image */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            <div className="md:col-span-7 space-y-4">
              <div>
                <label
                  htmlFor="league-name-field"
                  className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                >
                  Name of the League *
                </label>
                <input
                  id="league-name-field"
                  name="league_name"
                  type="text"
                  required
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="e.g. Metro Manila Commissioner's Cup 2026"
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-base font-semibold text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="league-start-date"
                    className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                  >
                    Start Date *
                  </label>
                  <input
                    id="league-start-date"
                    name="start_date"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-base font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="league-end-date"
                    className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                  >
                    End Date *
                  </label>
                  <input
                    id="league-end-date"
                    name="end_date"
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-base font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Image of the League Upload / Preview */}
            <div className="md:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-2">
                Image of the League (Banner / Crest)
              </span>

              {leagueImageUrl ? (
                <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img
                    src={leagueImageUrl}
                    alt="League preview"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setLeagueImageUrl("")}
                    className="absolute top-2 right-2 rounded-full bg-slate-900/80 p-1 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="mb-3 flex h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                  <ImageIcon className="h-7 w-7 mb-1" aria-hidden="true" />
                  <span className="text-[0.7rem] font-bold uppercase">
                    Upload Image or Paste URL
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B2F5C] px-3 py-2 text-xs font-black uppercase text-white cursor-pointer">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload File
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) =>
                      handleImageFileSelect(e, setLeagueImageUrl, 480)
                    }
                  />
                </label>
                <input
                  type="url"
                  placeholder="Or Image URL..."
                  value={
                    leagueImageUrl.startsWith("data:") ? "" : leagueImageUrl
                  }
                  onChange={(e) => setLeagueImageUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 2. Courts to be Used */}
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
              Courts to be Used *
            </legend>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <label htmlFor="court-name-input" className="sr-only">
                  Court Name
                </label>
                <input
                  id="court-name-input"
                  type="text"
                  placeholder="Court Name (e.g. San Juan Arena)"
                  value={courtNameInput}
                  onChange={(e) => setCourtNameInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div className="sm:col-span-4">
                <label htmlFor="court-address-input" className="sr-only">
                  Court Address
                </label>
                <input
                  id="court-address-input"
                  type="text"
                  placeholder="Location / Address"
                  value={courtAddressInput}
                  onChange={(e) => setCourtAddressInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="court-surface-select" className="sr-only">
                  Surface Type
                </label>
                <select
                  id="court-surface-select"
                  value={courtSurfaceInput}
                  onChange={(e) =>
                    setCourtSurfaceInput(
                      e.target.value as LeagueCourt["surfaceType"]
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="Hardwood">Hardwood</option>
                  <option value="Covered Gym">Covered Gym</option>
                  <option value="Acrylic Outdoor">Acrylic Outdoor</option>
                  <option value="Sport Court">Sport Court</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddCourt}
                  className="w-full rounded-lg bg-[#8B0D0E] px-3 py-2 text-xs font-black uppercase text-white cursor-pointer"
                >
                  + Add Court
                </button>
              </div>
            </div>

            {courtsList.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {courtsList.map((c) => (
                  <li
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs"
                  >
                    <MapPin
                      className="h-3.5 w-3.5 text-[#8B0D0E]"
                      aria-hidden="true"
                    />
                    <span>
                      {c.name} — {c.address} ({c.surfaceType})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCourt(c.id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Remove ${c.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/* 3. Researched Basketball Rules Selector (FIBA, NBA, NCAA, FIBA 3x3, Custom) */}
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
              Official League Rules (FIBA, NBA, NCAA, FIBA 3x3, or Custom) *
            </legend>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
              {RULE_SET_OPTIONS.map((opt) => {
                const isSelected = selectedRuleSetId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectRulePreset(opt.id)}
                    className={`flex flex-col items-start justify-between rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#0B2F5C] bg-[#0B2F5C] text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-black uppercase tracking-wider">
                      {opt.shortTitle}
                    </span>
                    <span
                      className={`mt-1 text-[0.65rem] font-bold ${
                        isSelected ? "text-amber-300" : "text-slate-500"
                      }`}
                    >
                      {opt.tag}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase text-[#0B2F5C]">
                    {rulesConfig.ruleSetName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Governing Body: {rulesConfig.governingBody} • 3PT Arc:{" "}
                    {rulesConfig.threePointDistance}
                  </p>
                </div>
                <span className="rounded bg-rose-50 px-2.5 py-1 text-[0.68rem] font-black uppercase text-[#8B0D0E]">
                  Parameters Adjustable Below
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label
                    htmlFor="rule-periods"
                    className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1"
                  >
                    Periods
                  </label>
                  <input
                    id="rule-periods"
                    type="number"
                    min={1}
                    max={4}
                    value={rulesConfig.periodsCount}
                    onChange={(e) =>
                      setRulesConfig({
                        ...rulesConfig,
                        periodsCount: Number(e.target.value) || 4,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-black text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-mins"
                    className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1"
                  >
                    Mins / Period
                  </label>
                  <input
                    id="rule-mins"
                    type="number"
                    min={5}
                    max={25}
                    value={rulesConfig.periodLengthMinutes}
                    onChange={(e) =>
                      setRulesConfig({
                        ...rulesConfig,
                        periodLengthMinutes: Number(e.target.value) || 10,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-black text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-shotclock"
                    className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1"
                  >
                    Shot Clock (s)
                  </label>
                  <input
                    id="rule-shotclock"
                    type="number"
                    min={10}
                    max={35}
                    value={rulesConfig.shotClockSeconds}
                    onChange={(e) =>
                      setRulesConfig({
                        ...rulesConfig,
                        shotClockSeconds: Number(e.target.value) || 24,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-black text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-foullimit"
                    className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1"
                  >
                    Foul-Out Limit
                  </label>
                  <input
                    id="rule-foullimit"
                    type="number"
                    min={4}
                    max={7}
                    value={rulesConfig.personalFoulLimit}
                    onChange={(e) =>
                      setRulesConfig({
                        ...rulesConfig,
                        personalFoulLimit: Number(e.target.value) || 5,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-black text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-bonus"
                    className="block text-[0.68rem] font-black uppercase text-slate-600 mb-1"
                  >
                    Bonus Foul #
                  </label>
                  <input
                    id="rule-bonus"
                    type="number"
                    min={4}
                    max={10}
                    value={rulesConfig.teamFoulBonusThreshold}
                    onChange={(e) =>
                      setRulesConfig({
                        ...rulesConfig,
                        teamFoulBonusThreshold: Number(e.target.value) || 5,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-black text-slate-900"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[0.68rem] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Official {selectedRuleSetId} Rulebook Specifications:
                </div>
                <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                  {rulesConfig.summaryHighlights.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                  <li>
                    <strong>Timeouts Policy:</strong>{" "}
                    {rulesConfig.timeoutsPolicy}
                  </li>
                </ul>
              </div>
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={closeCreateLeagueModal}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingLeague}
              className="rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:opacity-95 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: editingLeagueId ? "#0B2F5C" : "#8B0D0E",
              }}
            >
              {isSavingLeague
                ? "Saving League..."
                : editingLeagueId
                  ? "Save League Changes"
                  : "Create League & Proceed to Add Teams →"}
            </button>
          </div>
        </form>
      </dialog>

      {/* =====================================================================
          MODAL 2: ADD OR UPDATE TEAM IN LEAGUE (<dialog closedby="any">)
          Supports both creating a new team and updating an existing team!
         ===================================================================== */}
      <dialog
        ref={createTeamDialogRef}
        aria-labelledby={createTeamTitleId}
        {...({ closedby: "any" } as Record<string, string>)}
        className="m-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl overflow-hidden"
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-white"
          style={{
            backgroundColor: editingTeamId ? "#0B2F5C" : "#8B0D0E",
          }}
        >
          <div>
            <h2
              id={createTeamTitleId}
              className="text-xl font-black uppercase tracking-tight"
            >
              {editingTeamId
                ? `Update Team: ${teamName || "Franchise"}`
                : `Add Team to ${selectedLeague?.name}`}
            </h2>
            <p className="text-xs text-slate-100">
              {editingTeamId
                ? "Edit team name, logo, colors, coaching staff, roster players, photos, or Captain Ball"
                : "Configure team identity, primary/secondary colors, coaching staff photos, manager, player roster photos, and select Captain Ball"}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePopulateAllStaffAndRoster}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm hover:bg-amber-300 active:scale-95 transition-all cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              Randomize Staff & Roster
            </button>
            <button
              type="button"
              onClick={closeCreateTeamModal}
              aria-label="Close team modal"
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <form
          method="POST"
          onSubmit={handleSaveTeamSubmit}
          className="max-h-[82vh] overflow-y-auto p-6 space-y-6"
        >
          {/* 1. Team Name, Image & Primary/Secondary Colors */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            <div className="md:col-span-7 space-y-4">
              <div>
                <label
                  htmlFor="team-name-field"
                  className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                >
                  Team Name *
                </label>
                <input
                  id="team-name-field"
                  name="team_name"
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Barangay San Juan Knights"
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-base font-semibold text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Division / Category Selector */}
              {selectedLeague && (selectedLeague.categories?.length ?? 0) > 0 && (
                <div>
                  <label
                    htmlFor="team-category-select"
                    className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-1.5"
                  >
                    Division / Category Assignment
                  </label>
                  <select
                    id="team-category-select"
                    value={teamCategoryId}
                    onChange={(e) => setTeamCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-black text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
                  >
                    <option value="">-- No Category (Open / General) --</option>
                    {selectedLeague.categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.code || cat.name}) • {cat.ruleSetId} Rules
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Primary & Secondary Colors */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label
                    htmlFor="team-primary-color"
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800 mb-2"
                  >
                    <Palette className="h-3.5 w-3.5 text-[#8B0D0E]" />
                    Primary Color *
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      id="team-primary-color"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold uppercase text-slate-900"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label
                    htmlFor="team-secondary-color"
                    className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800 mb-2"
                  >
                    <Palette className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    Secondary Color *
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      id="team-secondary-color"
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold uppercase text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Team Logo / Crest Upload */}
            <div className="md:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-2">
                Team Image / Logo
              </span>

              <div
                className="relative mb-3 flex h-28 w-full items-center justify-center rounded-xl border border-slate-200 p-3 text-white shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                }}
              >
                {teamImageUrl ? (
                  <>
                    <img
                      src={teamImageUrl}
                      alt="Team logo preview"
                      className="h-20 w-20 rounded-xl object-cover bg-white p-1 shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => setTeamImageUrl("")}
                      className="absolute top-2 right-2 rounded-full bg-slate-900/80 p-1 text-white"
                      aria-label="Remove team logo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-2xl font-black uppercase">
                      {teamName ? teamName.slice(0, 2) : "TM"}
                    </div>
                    <div className="text-[0.65rem] font-bold uppercase opacity-80">
                      Live Jersey Color Preview
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B2F5C] px-3 py-2 text-xs font-black uppercase text-white cursor-pointer">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => handleImageFileSelect(e, setTeamImageUrl)}
                  />
                </label>
                <input
                  type="url"
                  placeholder="Or Image URL..."
                  value={teamImageUrl.startsWith("data:") ? "" : teamImageUrl}
                  onChange={(e) => setTeamImageUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 2. Coaching Staff & Team Manager (WITH IMAGE UPLOADS & RANDOM GENERATOR) */}
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
                Coaching Staff & Team Manager (with Photos) *
              </legend>
              <button
                type="button"
                onClick={handlePopulateCoachingStaff}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0B2F5C]/30 bg-[#0B2F5C]/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#0B2F5C] hover:bg-[#0B2F5C] hover:text-white transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Randomize Coaching Staff
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Head Coach Name + Photo */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                <label
                  htmlFor="team-head-coach"
                  className="block text-xs font-black uppercase tracking-wider text-slate-700"
                >
                  Head Coach *
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    {headCoachImageUrl ? (
                      <img
                        src={headCoachImageUrl}
                        alt="Head Coach preview"
                        width={52}
                        height={52}
                        className="h-13 w-13 rounded-xl object-cover border border-slate-200 shadow-2xs"
                      />
                    ) : (
                      <div
                        className="flex h-13 w-13 items-center justify-center rounded-xl text-xs font-black uppercase text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        HC
                      </div>
                    )}
                    {headCoachImageUrl && (
                      <button
                        type="button"
                        onClick={() => setHeadCoachImageUrl("")}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-900 p-0.5 text-white"
                        aria-label="Remove Head Coach photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <input
                      id="team-head-coach"
                      type="text"
                      required
                      placeholder="e.g. Coach Mateo Villanueva"
                      value={headCoach}
                      onChange={(e) => setHeadCoach(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-900"
                    />
                    <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2F5C] px-2.5 py-1 text-[0.68rem] font-black uppercase text-white cursor-pointer">
                      <Camera className="h-3 w-3" aria-hidden="true" />
                      Upload Coach Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) =>
                          handleImageFileSelect(e, setHeadCoachImageUrl)
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Team Manager Name + Photo */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                <label
                  htmlFor="team-manager"
                  className="block text-xs font-black uppercase tracking-wider text-slate-700"
                >
                  Team Manager *
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    {managerImageUrl ? (
                      <img
                        src={managerImageUrl}
                        alt="Team Manager preview"
                        width={52}
                        height={52}
                        className="h-13 w-13 rounded-xl object-cover border border-slate-200 shadow-2xs"
                      />
                    ) : (
                      <div
                        className="flex h-13 w-13 items-center justify-center rounded-xl text-xs font-black uppercase text-white"
                        style={{ backgroundColor: secondaryColor }}
                      >
                        MGR
                      </div>
                    )}
                    {managerImageUrl && (
                      <button
                        type="button"
                        onClick={() => setManagerImageUrl("")}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-900 p-0.5 text-white"
                        aria-label="Remove Team Manager photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <input
                      id="team-manager"
                      type="text"
                      required
                      placeholder="e.g. Rafael Soriano"
                      value={teamManager}
                      onChange={(e) => setTeamManager(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-900"
                    />
                    <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2F5C] px-2.5 py-1 text-[0.68rem] font-black uppercase text-white cursor-pointer">
                      <Camera className="h-3 w-3" aria-hidden="true" />
                      Upload Manager Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) =>
                          handleImageFileSelect(e, setManagerImageUrl)
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Assistant Coaches Multi-Entry with Photos & Inline Name Editing */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <label
                htmlFor="team-assistant-input"
                className="block text-xs font-black uppercase tracking-wider text-slate-700"
              >
                Assistant Coaches & Staff Photos
              </label>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <input
                  id="team-assistant-input"
                  type="text"
                  placeholder="Add Assistant Coach name..."
                  value={assistantCoachInput}
                  onChange={(e) => setAssistantCoachInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                />
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-black uppercase text-[#0B2F5C] cursor-pointer">
                  {assistantCoachImageInput ? (
                    <img
                      src={assistantCoachImageInput}
                      alt="Assistant coach preview"
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) =>
                      handleImageFileSelect(e, setAssistantCoachImageInput)
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddAssistantCoach}
                  className="rounded-lg bg-[#0B2F5C] px-4 py-2 text-xs font-black uppercase text-white cursor-pointer"
                >
                  + Add Coach
                </button>
              </div>

              {assistantCoachStaff.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  {assistantCoachStaff.map((coach) => (
                    <div
                      key={coach.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <label
                          title="Click to upload or replace coach photo"
                          className="relative shrink-0 cursor-pointer"
                        >
                          <img
                            src={
                              coach.imageUrl ||
                              generatePortraitAvatarDataUrl({
                                name: coach.name,
                                primaryColor,
                                secondaryColor,
                                roleLabel: "ASST COACH",
                              })
                            }
                            alt={coach.name}
                            width={36}
                            height={36}
                            className="h-9 w-9 rounded-lg object-cover border border-slate-200"
                          />
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0B2F5C] text-white">
                            <Camera className="h-2.5 w-2.5" />
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) =>
                              handleImageFileSelect(e, (url) =>
                                handleUpdateDraftAssistantPhoto(coach.id, url)
                              )
                            }
                          />
                        </label>
                        <input
                          type="text"
                          value={coach.name}
                          onChange={(e) =>
                            handleUpdateDraftAssistantName(
                              coach.id,
                              e.target.value
                            )
                          }
                          aria-label="Assistant coach name"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setAssistantCoachStaff((prev) =>
                            prev.filter((c) => c.id !== coach.id)
                          )
                        }
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${coach.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </fieldset>

          {/* 3. Team Roster Builder (WITH PLAYER PHOTOS, INLINE EDITING & RANDOM GENERATOR) */}
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="px-1 text-xs font-black uppercase tracking-wider text-slate-800">
                Team Roster ({draftRoster.length} Players) & Select Captain Ball
                *
              </legend>
              <button
                type="button"
                onClick={handlePopulateRoster}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#8B0D0E]/30 bg-[#8B0D0E]/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#8B0D0E] hover:bg-[#8B0D0E] hover:text-white transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Randomize 12-Man Roster
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label htmlFor="draft-first-name" className="sr-only">
                  Player First Name
                </label>
                <input
                  id="draft-first-name"
                  type="text"
                  placeholder="First Name"
                  value={draftFirstName}
                  onChange={(e) => setDraftFirstName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="draft-last-name" className="sr-only">
                  Player Last Name
                </label>
                <input
                  id="draft-last-name"
                  type="text"
                  placeholder="Last Name"
                  value={draftLastName}
                  onChange={(e) => setDraftLastName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="draft-jersey-num" className="sr-only">
                  Jersey Number
                </label>
                <input
                  id="draft-jersey-num"
                  type="number"
                  min={0}
                  max={99}
                  placeholder="Jersey #"
                  value={draftJersey}
                  onChange={(e) => setDraftJersey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-900"
                />
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="draft-pos-select" className="sr-only">
                  Position
                </label>
                <select
                  id="draft-pos-select"
                  value={draftPosition}
                  onChange={(e) =>
                    setDraftPosition(e.target.value as PlayerPosition)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-black text-slate-900"
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flex h-full w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-black uppercase text-[#0B2F5C] cursor-pointer">
                  {draftPlayerImageUrl ? (
                    <img
                      src={draftPlayerImageUrl}
                      alt="Player preview"
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Player Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) =>
                      handleImageFileSelect(e, setDraftPlayerImageUrl)
                    }
                  />
                </label>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddDraftPlayer}
                  className="w-full h-full rounded-lg bg-[#8B0D0E] px-3 py-2 text-xs font-black uppercase text-white cursor-pointer"
                >
                  + Add Player
                </button>
              </div>
            </div>

            {draftRoster.length === 0 ? (
              <p className="text-xs text-slate-500">
                Add players above (or click{" "}
                <strong>Randomize 12-Man Roster</strong>) and click{" "}
                <strong>Captain Ball</strong> next to your team leader. You can
                edit any player&apos;s name, jersey, position, or photo below.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {draftRoster.map((p) => {
                  const isCaptain = draftCaptainId === p.id;
                  const playerImg =
                    p.imageUrl ||
                    generatePortraitAvatarDataUrl({
                      name: `${p.firstName} ${p.lastName}`,
                      primaryColor,
                      secondaryColor,
                      badgeText: `#${p.jerseyNumber}`,
                      roleLabel: p.position,
                    });

                  return (
                    <div
                      key={p.id}
                      className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs ${
                        isCaptain ? "bg-amber-50/80" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2.5 flex-1">
                        {/* Clickable Player Avatar in Draft Roster */}
                        <label
                          title={`Click to upload photo for ${p.firstName} ${p.lastName}`}
                          className="relative shrink-0 cursor-pointer"
                        >
                          <img
                            src={playerImg}
                            alt={`${p.firstName} ${p.lastName}`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-xl object-cover border border-slate-200 shadow-2xs"
                          />
                          <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#0B2F5C] text-white shadow">
                            <Camera className="h-2.5 w-2.5" />
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) =>
                              handleImageFileSelect(e, (url) =>
                                handleUpdateDraftPlayerPhoto(p.id, url)
                              )
                            }
                          />
                        </label>

                        {/* Editable Jersey Number */}
                        <input
                          type="number"
                          min={0}
                          max={99}
                          aria-label="Jersey number"
                          value={p.jerseyNumber}
                          onChange={(e) =>
                            handleUpdateDraftPlayerField(p.id, {
                              jerseyNumber: Number(e.target.value) || 0,
                            })
                          }
                          className="w-14 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-center font-black text-slate-900 tabular-nums"
                        />

                        {/* Editable First Name */}
                        <input
                          type="text"
                          aria-label="First name"
                          value={p.firstName}
                          onChange={(e) =>
                            handleUpdateDraftPlayerField(p.id, {
                              firstName: e.target.value,
                            })
                          }
                          className="w-28 sm:w-32 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-900"
                        />

                        {/* Editable Last Name */}
                        <input
                          type="text"
                          aria-label="Last name"
                          value={p.lastName}
                          onChange={(e) =>
                            handleUpdateDraftPlayerField(p.id, {
                              lastName: e.target.value,
                            })
                          }
                          className="w-28 sm:w-36 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-900"
                        />

                        {/* Editable Position */}
                        <select
                          aria-label="Position"
                          value={p.position}
                          onChange={(e) =>
                            handleUpdateDraftPlayerField(p.id, {
                              position: e.target.value as PlayerPosition,
                            })
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-black text-slate-800"
                        >
                          {POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectDraftCaptain(p.id)}
                          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 font-black uppercase transition-colors cursor-pointer ${
                            isCaptain
                              ? "bg-amber-400 text-slate-950 shadow-2xs"
                              : "border border-slate-300 text-slate-600 hover:border-amber-400"
                          }`}
                        >
                          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                          {isCaptain ? "Captain Ball" : "Set Captain"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftPlayer(p.id)}
                          className="rounded p-1 text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${p.firstName} ${p.lastName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={closeCreateTeamModal}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingTeam}
              className="rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:opacity-95 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: editingTeamId ? "#0B2F5C" : "#8B0D0E",
              }}
            >
              {isSavingTeam
                ? editingTeamId
                  ? "Updating Team..."
                  : "Registering Team..."
                : editingTeamId
                  ? "Save Team Updates"
                  : "Save Team to League"}
            </button>
          </div>
        </form>
      </dialog>

      {/* =====================================================================
         MODAL 3: ROLE-BASED ACCESS & TABLE OFFICIALS MANAGER (<dialog>)
         Only the League Creator/Owner can access this modal to add Admins & Table Officials
         ===================================================================== */}
      <dialog
        ref={manageRolesDialogRef}
        aria-labelledby="manage-roles-title"
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs m-auto"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#0B2F5C] px-2.5 py-0.5 text-[0.68rem] font-black uppercase tracking-wider text-white">
                <Shield className="h-3 w-3" />
                Access Control &amp; Officials
              </span>
              <h2
                id="manage-roles-title"
                className="text-2xl font-black uppercase tracking-tight text-slate-900 mt-1"
              >
                League Admins &amp; Table Officials
              </h2>
              <p className="text-xs text-slate-500">
                Grant elevated administrative rights or assign dedicated table officials for{" "}
                <strong>{selectedLeague?.name}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={closeManageRolesModal}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {memberActionNotice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800">
              {memberActionNotice}
            </div>
          )}

          {/* Form to Add New Member */}
          <form
            onSubmit={handleAddMemberSubmit}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                + Assign New Admin or Table Official
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                  User Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-[#0B2F5C]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                  Display / Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Ramos"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-[#0B2F5C]"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                  Assigned Role &amp; Permission
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as LeagueMemberRole)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-black text-slate-900"
                >
                  <option value="ADMIN">League Admin (Can edit league &amp; teams)</option>
                  <option value="OFFICIAL_SCORER">Official Scorer (Scorebook only)</option>
                  <option value="GAME_TIMER">Game Timer (Game clock only)</option>
                  <option value="SHOT_CLOCK">Shot Clock (Shot clock only)</option>
                  <option value="TABLE_OFFICIAL">Table Official (All table operations)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[0.68rem] text-slate-500">
                Table officials can operate the game table during live matches but <strong>cannot edit</strong> league settings, courts, or rulebooks.
              </p>
              <button
                type="submit"
                disabled={isAddingMember}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isAddingMember ? "Sending Invite..." : "Send Role Invitation"}
              </button>
            </div>
          </form>

          {/* Existing Assigned Members List */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
              League Admins &amp; Table Officials ({selectedLeague?.members?.length ?? 0})
            </h3>

            {(!selectedLeague?.members || selectedLeague.members.length === 0) ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500">
                No extra admins or table officials assigned yet. Only you (the League Creator) have full access to edit this league.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                {selectedLeague.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">
                          {member.displayName || member.email}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase ${
                            member.role === "ADMIN"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {member.role === "ADMIN"
                            ? "League Admin"
                            : member.role === "OFFICIAL_SCORER"
                              ? "Official Scorer"
                              : member.role === "GAME_TIMER"
                                ? "Game Timer"
                                : member.role === "SHOT_CLOCK"
                                  ? "Shot Clock Operator"
                                  : "Table Official"}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`rounded-md px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wider border ${
                            member.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : member.status === "DECLINED"
                                ? "bg-rose-50 text-rose-700 border-rose-300"
                                : "bg-emerald-50 text-emerald-700 border-emerald-300"
                          }`}
                        >
                          {member.status === "PENDING"
                            ? "Pending Acceptance"
                            : member.status === "DECLINED"
                              ? "Declined"
                              : "Active Official"}
                        </span>
                      </div>
                      <span className="text-[0.7rem] text-slate-500">
                        {member.email} • Added on {new Date(member.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(e) =>
                          selectedLeague &&
                          updateLeagueMemberRole(
                            selectedLeague.id,
                            member.id,
                            e.target.value as LeagueMemberRole
                          )
                        }
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="OFFICIAL_SCORER">Official Scorer</option>
                        <option value="GAME_TIMER">Game Timer</option>
                        <option value="SHOT_CLOCK">Shot Clock</option>
                        <option value="TABLE_OFFICIAL">Table Official</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          selectedLeague &&
                          removeLeagueMember(selectedLeague.id, member.id)
                        }
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={closeManageRolesModal}
              className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </dialog>

      {/* =====================================================================
          MODAL 4: BULK UPLOAD TEAMS (<dialog closedby="any">)
         ===================================================================== */}
      <dialog
        ref={bulkUploadDialogRef}
        aria-labelledby="bulk-upload-teams-title"
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs m-auto"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#8B0D0E] px-2.5 py-0.5 text-[0.68rem] font-black uppercase tracking-wider text-white">
                <Upload className="h-3 w-3" />
                Batch Registration
              </span>
              <h2
                id="bulk-upload-teams-title"
                className="text-2xl font-black uppercase tracking-tight text-slate-900 mt-1"
              >
                Bulk Upload Teams
              </h2>
              <p className="text-xs text-slate-500">
                Register multiple franchises simultaneously into{" "}
                <strong>{selectedLeague?.name}</strong> via CSV or JSON.
              </p>
            </div>
            <button
              type="button"
              onClick={closeBulkUploadModal}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {bulkUploadNoticeSection()}

          {/* Upload Method Tabs & Sample Guidance */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-black uppercase tracking-wider text-[#0B2F5C] flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-[#0B2F5C]" />
                Accepted Formats &amp; Ready-Made Templates
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate("csv")}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[0.7rem] font-black uppercase text-[#0B2F5C] hover:bg-blue-50 cursor-pointer shadow-2xs"
                  title="Download .CSV spreadsheet template"
                >
                  <Download className="h-3.5 w-3.5 text-[#0B2F5C]" />
                  Download CSV Template
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate("json")}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[0.7rem] font-black uppercase text-[#0B2F5C] hover:bg-blue-50 cursor-pointer shadow-2xs"
                  title="Download .JSON template"
                >
                  <Download className="h-3.5 w-3.5 text-[#0B2F5C]" />
                  Download JSON Template
                </button>
              </div>
            </div>
            <p className="leading-relaxed">
              Download the official template or click <strong>Use Sample</strong> below to populate the editor. You can also upload your own completed <strong>.csv</strong> or <strong>.json</strong> file!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg bg-white p-2.5 border border-blue-200 font-mono text-[0.7rem] text-slate-800 space-y-1.5">
                <div className="flex items-center justify-between font-sans">
                  <div className="font-bold text-[#0B2F5C] flex items-center gap-1">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    CSV Format
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate("csv")}
                    className="text-[0.68rem] font-black uppercase tracking-wider text-[#8B0D0E] hover:underline cursor-pointer"
                  >
                    Paste Sample CSV →
                  </button>
                </div>
                <div className="text-slate-500 font-mono">Team Name, #Primary, #Secondary, Coach, Manager, Category</div>
                <div className="text-slate-700 font-mono">Vipers, #8B0D0E, #0B2F5C, Alex Rivera, Sarah Tan, {selectedLeague?.categories?.[0]?.name || "Men"}</div>
                <div className="text-slate-700 font-mono">Hawks, #0B2F5C, #FDB927, Marcus Vance, David Lim, {selectedLeague?.categories?.[0]?.name || "Men"}</div>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-blue-200 font-mono text-[0.7rem] text-slate-800 space-y-1.5">
                <div className="flex items-center justify-between font-sans">
                  <div className="font-bold text-[#0B2F5C]">JSON Format</div>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate("json")}
                    className="text-[0.68rem] font-black uppercase tracking-wider text-[#8B0D0E] hover:underline cursor-pointer"
                  >
                    Paste Sample JSON →
                  </button>
                </div>
                <div className="text-slate-500 font-mono">[&#123; &quot;name&quot;: &quot;Vipers&quot;, &quot;primaryColor&quot;: &quot;#8B0D0E&quot;, &quot;headCoach&quot;: &quot;Alex Rivera&quot;, &quot;category&quot;: &quot;{selectedLeague?.categories?.[0]?.name || "Men"}&quot; &#125;]</div>
              </div>
            </div>
          </div>

          {/* File Picker or Direct Paste */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                Paste CSV / JSON Data:
              </label>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
                <Upload className="h-3.5 w-3.5 text-[#0B2F5C]" />
                Select .CSV or .JSON File
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleBulkFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <textarea
              rows={6}
              value={bulkInputText}
              onChange={(e) => handleParseBulkInput(e.target.value)}
              placeholder="Paste team data here..."
              className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800 focus:border-[#0B2F5C] focus:outline-hidden"
            />
          </div>

          {/* Preview Parsed Teams */}
          {bulkParsedTeams.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Detected Teams Preview ({bulkParsedTeams.length}):
                </span>
                <span className="text-[0.7rem] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Ready to Import
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {bulkParsedTeams.map((team, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-xs bg-slate-50/50 hover:bg-white">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">
                        <span
                          className="h-5 w-5 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: team.primaryColor }}
                        />
                        <span
                          className="h-5 w-5 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: team.secondaryColor }}
                        />
                      </div>
                      <div>
                        <strong className="font-black text-slate-800 text-sm">{team.name}</strong>
                        <div className="text-[0.7rem] text-slate-500">
                          Coach: {team.headCoach || "N/A"} • Mgr: {team.manager || "N/A"}
                          {team.categoryName && (
                            <span className="ml-1.5 rounded-sm bg-blue-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-[#0B2F5C]">
                              {team.categoryName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-[0.7rem] font-bold text-slate-600">
                      {team.roster.length} Players
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer CTAs */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={closeBulkUploadModal}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkUploadSubmit}
              disabled={isBulkUploading || bulkParsedTeams.length === 0}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#8B0D0E" }}
            >
              <Upload className="h-4 w-4" />
              {isBulkUploading ? "Uploading..." : `Upload ${bulkParsedTeams.length} Teams`}
            </button>
          </div>
        </div>
      </dialog>

      {/* =====================================================================
          MODAL 5: BULK UPLOAD PLAYERS FOR A TEAM (<dialog closedby="any">)
         ===================================================================== */}
      {(() => {
        const targetTeam = teams.find((t) => t.id === targetBulkPlayerTeamId);
        return (
          <dialog
            ref={bulkPlayersDialogRef}
            aria-labelledby="bulk-upload-players-title"
            className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs m-auto"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[0.68rem] font-black uppercase tracking-wider text-white"
                    style={{ backgroundColor: targetTeam?.primaryColor || "#0B2F5C" }}
                  >
                    <Users className="h-3 w-3" />
                    Roster Batch Registration
                  </span>
                  <h2
                    id="bulk-upload-players-title"
                    className="text-2xl font-black uppercase tracking-tight text-slate-900 mt-1"
                  >
                    Bulk Upload Players &amp; Portraits
                  </h2>
                  <p className="text-xs text-slate-500">
                    Add multiple roster players with jersey numbers, positions, captain status, and portrait photo URLs into{" "}
                    <strong>{targetTeam?.name || "Team"}</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBulkPlayersModal}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Status alerts */}
              {bulkPlayerError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {bulkPlayerError}
                </div>
              )}
              {bulkPlayerSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                  {bulkPlayerSuccess}
                </div>
              )}

              {/* Template & Formats Card */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs text-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-700" />
                    Accepted Player Formats &amp; Ready-Made Templates
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadPlayerTemplate("csv")}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[0.7rem] font-black uppercase text-indigo-900 hover:bg-indigo-50 cursor-pointer shadow-2xs"
                      title="Download .CSV player template"
                    >
                      <Download className="h-3.5 w-3.5 text-indigo-700" />
                      Download CSV Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadPlayerTemplate("json")}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[0.7rem] font-black uppercase text-indigo-900 hover:bg-indigo-50 cursor-pointer shadow-2xs"
                      title="Download .JSON player template"
                    >
                      <Download className="h-3.5 w-3.5 text-indigo-700" />
                      Download JSON Template
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg bg-white p-2.5 border border-indigo-200 font-mono text-[0.7rem] text-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between font-sans">
                      <div className="font-bold text-indigo-950 flex items-center gap-1">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-700" />
                        CSV Player Format
                      </div>
                      <button
                        type="button"
                        onClick={() => handleParseBulkPlayers(getSamplePlayerTemplate("csv"), targetTeam)}
                        className="text-[0.68rem] font-black uppercase tracking-wider text-indigo-700 hover:underline cursor-pointer"
                      >
                        Paste Sample CSV →
                      </button>
                    </div>
                    <div className="text-slate-500 font-mono">First, Last, Jersey, Position, IsCaptain, Image URL</div>
                    <div className="text-slate-700 font-mono">Marcus, Smart, 36, PG, true, https://...</div>
                    <div className="text-slate-700 font-mono">Jaylen, Brown, 7, SG, false, https://...</div>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-indigo-200 font-mono text-[0.7rem] text-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between font-sans">
                      <div className="font-bold text-indigo-950">JSON Player Format</div>
                      <button
                        type="button"
                        onClick={() => handleParseBulkPlayers(getSamplePlayerTemplate("json"), targetTeam)}
                        className="text-[0.68rem] font-black uppercase tracking-wider text-indigo-700 hover:underline cursor-pointer"
                      >
                        Paste Sample JSON →
                      </button>
                    </div>
                    <div className="text-slate-500 font-mono">[&#123; &quot;firstName&quot;: &quot;Marcus&quot;, &quot;lastName&quot;: &quot;Smart&quot;, &quot;jerseyNumber&quot;: 36, &quot;position&quot;: &quot;PG&quot;, &quot;imageUrl&quot;: &quot;https://...&quot; &#125;]</div>
                  </div>
                </div>
              </div>

              {/* Textarea or File Upload */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Paste Players CSV / JSON Data:
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
                    <Upload className="h-3.5 w-3.5 text-indigo-700" />
                    Select .CSV or .JSON File
                    <input
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      onChange={(e) => handleBulkPlayerFileUpload(e, targetTeam)}
                      className="hidden"
                    />
                  </label>
                </div>

                <textarea
                  rows={6}
                  value={bulkPlayerInputText}
                  onChange={(e) => handleParseBulkPlayers(e.target.value, targetTeam)}
                  placeholder="Paste player rows here..."
                  className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden"
                />
              </div>

              {/* Preview Parsed Players */}
              {bulkParsedPlayers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Detected Players Preview ({bulkParsedPlayers.length}):
                    </span>
                    <span className="text-[0.7rem] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Ready to Add
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {bulkParsedPlayers.map((player) => (
                      <div key={player.id} className="flex items-center justify-between p-3 text-xs bg-slate-50/50 hover:bg-white">
                        <div className="flex items-center gap-3">
                          {player.imageUrl ? (
                            <img
                              src={player.imageUrl}
                              alt={`${player.firstName} ${player.lastName}`}
                              className="h-9 w-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-xs">
                              #{player.jerseyNumber}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <strong className="font-black text-slate-800 text-sm">
                                {player.firstName} {player.lastName}
                              </strong>
                              {player.isCaptain && (
                                <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-amber-800">
                                  Captain
                                </span>
                              )}
                            </div>
                            <div className="text-[0.7rem] text-slate-500">
                              Jersey #{player.jerseyNumber} • Position: <strong className="text-slate-700">{player.position}</strong>
                            </div>
                          </div>
                        </div>
                        <span className="text-[0.7rem] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          {player.position}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer CTAs */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeBulkPlayersModal}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkPlayerSubmit}
                  disabled={isBulkUploadingPlayers || bulkParsedPlayers.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: targetTeam?.primaryColor || "#0B2F5C" }}
                >
                  <Users className="h-4 w-4" />
                  {isBulkUploadingPlayers ? "Adding Players..." : `Add ${bulkParsedPlayers.length} Players`}
                </button>
              </div>
            </div>
          </dialog>
        );
      })()}

      {/* =====================================================================
          ACTION HUB MODAL: TRIGGERED BY "EDIT LEAGUE" (MANAGE, ADD TEAM, DELETE)
         ===================================================================== */}
      {selectedLeague && (
        <dialog
          ref={leagueActionHubDialogRef}
          aria-labelledby="league-action-hub-title"
          className="fixed inset-0 m-auto max-w-lg w-full rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs border border-slate-200"
        >
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#0B2F5C]">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="league-action-hub-title" className="text-base font-black uppercase text-slate-900">
                    League Management
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">{selectedLeague.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLeagueActionHub}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Option 1: Edit League Details (Name, Dates, Courts) */}
              <button
                type="button"
                onClick={() => {
                  closeLeagueActionHub();
                  openEditLeagueModal(selectedLeague);
                }}
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-[#0B2F5C] group-hover:scale-105 transition-transform">
                    <Pencil className="h-5 w-5" />
                  </div>
                  <div>
                    <strong className="block text-sm font-black uppercase text-slate-900">
                      Edit League Details
                    </strong>
                    <span className="text-xs text-slate-500">
                      Change league name, dates, courts, and rulebook preset
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              </button>

              {/* Option 2: Add Team to League */}
              <button
                type="button"
                onClick={() => {
                  closeLeagueActionHub();
                  openCreateTeamModal();
                }}
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:scale-105 transition-transform">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <strong className="block text-sm font-black uppercase text-slate-900">
                      Add Team to League
                    </strong>
                    <span className="text-xs text-slate-500">
                      Create individual team, set coaches, colors, and initial roster
                    </span>
                  </div>
                </div>
                <span className="text-slate-400 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              </button>

              {/* Option 3: Manage Roles & Officials */}
              {selectedLeague.ownerId === userProfile?.id && (
                <button
                  type="button"
                  onClick={() => {
                    closeLeagueActionHub();
                    openManageRolesModal();
                  }}
                  className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 group-hover:scale-105 transition-transform">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <strong className="block text-sm font-black uppercase text-slate-900">
                        Manage Roles &amp; Officials
                      </strong>
                      <span className="text-xs text-slate-500">
                        Assign league administrators, scorers, and game timers
                      </span>
                    </div>
                  </div>
                  <span className="text-slate-400 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
                </button>
              )}

              {/* Option 4: Delete League (With Warning & Confirmation Input) */}
              {selectedLeague.ownerId === userProfile?.id && (
                <button
                  type="button"
                  onClick={() => {
                    closeLeagueActionHub();
                    openDeleteLeagueModal(selectedLeague);
                  }}
                  className="flex items-center justify-between p-4 rounded-2xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-left transition-all cursor-pointer group mt-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 group-hover:scale-105 transition-transform">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <div>
                      <strong className="block text-sm font-black uppercase text-rose-800">
                        Delete League
                      </strong>
                      <span className="text-xs text-rose-600">
                        Irreversible removal of tournament, teams, and stats
                      </span>
                    </div>
                  </div>
                  <span className="text-rose-400 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
                </button>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={closeLeagueActionHub}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* =====================================================================
          RULEBOOK INSPECTION DIALOG (OPENS VIA RULEBOOK ICON BADGE)
         ===================================================================== */}
      {selectedLeague && (
        <dialog
          ref={leagueRulesDialogRef}
          aria-labelledby="league-rules-dialog-title"
          className="fixed inset-0 m-auto max-w-2xl w-full rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs border border-slate-200"
        >
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="league-rules-dialog-title" className="text-base font-black uppercase text-slate-900">
                    Active Rulebook Configuration
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {selectedLeague.rulesConfig.ruleSetName} • {selectedLeague.rulesConfig.governingBody}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLeagueRulesModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  Regulation Format
                </span>
                <strong className="text-base font-black text-slate-900">
                  {selectedLeague.rulesConfig.periodsCount} × {selectedLeague.rulesConfig.periodLengthMinutes} mins
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  Shot Clock / OREB
                </span>
                <strong className="text-base font-black text-slate-900">
                  {selectedLeague.rulesConfig.shotClockSeconds}s / {selectedLeague.rulesConfig.offensiveReboundResetSeconds}s
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  Player Foul Limit
                </span>
                <strong className="text-base font-black text-[#8B0D0E]">
                  {selectedLeague.rulesConfig.personalFoulLimit} Personal Fouls
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  Team Bonus Penalty
                </span>
                <strong className="text-base font-black text-slate-900">
                  {selectedLeague.rulesConfig.teamFoulBonusThreshold}th Team Foul
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  3-Point Arc Distance
                </span>
                <strong className="text-sm font-black text-slate-900">
                  {selectedLeague.rulesConfig.threePointDistance}
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block text-[0.65rem] font-bold uppercase text-slate-400">
                  Def 3s &amp; Rim Rule
                </span>
                <strong className="text-sm font-black text-slate-900">
                  {selectedLeague.rulesConfig.defensiveThreeSeconds ? "Def 3s ON" : "No Def 3s"} •{" "}
                  {selectedLeague.rulesConfig.openRimInterferenceAllowed ? "FIBA Rim" : "Cylinder"}
                </strong>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
              <strong>Rules Enforcement:</strong> All official match clocks, team foul tracking, bonus free throws, and progressive running scores automatically conform to this active rulebook during game play.
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={closeLeagueRulesModal}
                className="rounded-xl bg-[#0B2F5C] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:opacity-95 cursor-pointer shadow-xs"
              >
                Got It
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* =====================================================================
          DELETE LEAGUE CONFIRMATION MODAL WITH "DELETE" INPUT VALIDATION
         ===================================================================== */}
      {leaguePendingDelete && (
        <dialog
          ref={deleteLeagueDialogRef}
          aria-labelledby="delete-league-modal-title"
          className="fixed inset-0 m-auto max-w-md w-full rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs border border-rose-200"
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
                <Trash2 className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 id="delete-league-modal-title" className="text-lg font-black uppercase text-slate-900">
                  Delete League
                </h3>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">
                  Destructive Action
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2 text-xs text-rose-900">
              <p>
                You are about to permanently delete <strong>{leaguePendingDelete.name}</strong> along with all associated teams, brackets, schedules, box scores, and statistics.
              </p>
              <p className="font-bold">
                This action is permanent and cannot be undone.
              </p>
            </div>

            {deleteError && (
              <div className="rounded-xl border border-rose-300 bg-rose-100 p-3 text-xs font-bold text-rose-900">
                {deleteError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="confirm-delete-input" className="block text-xs font-black uppercase text-slate-700">
                Type <span className="font-mono text-rose-600">DELETE</span> to confirm:
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                placeholder="DELETE"
                autoFocus
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeDeleteLeagueModal}
                disabled={isDeletingLeague}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLeague}
                disabled={isDeletingLeague || deleteConfirmationInput.trim() !== "DELETE"}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Trash2 className="h-4 w-4" />
                {isDeletingLeague ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
