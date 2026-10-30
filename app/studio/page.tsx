"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Bookmark,
  Camera,
  Check,
  Circle,
  Clock,
  Copy,
  Download,
  Film,
  Grid,
  GripHorizontal,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Layout,
  Mic,
  MicOff,
  Monitor,
  Music,
  Pause,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Repeat,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Settings,
  SkipForward,
  Sliders,
  Smartphone,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Tv,
  Upload,
  User,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import { supabase } from "@/lib/supabase-client";
import {
  StoredGameVideo,
  TimelineFrame,
  TimelineClockTag,
  saveVideoToIndexedDB,
  getAllStoredVideos,
  deleteStoredVideo,
} from "@/lib/video-storage";
import { generateUUID } from "@/lib/uuid";
import { LiveGameSession, PlayerGameStats } from "@/types/boxscore";

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPreciseTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

function getPeriodLabel(period: number, maxRegularPeriods = 4): string {
  if (period <= maxRegularPeriods) {
    return maxRegularPeriods === 2 ? `Half ${period}` : `Q${period}`;
  }
  const otIndex = period - maxRegularPeriods;
  return otIndex === 1 ? "OT" : `OT${otIndex}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export type StreamPlatform = "facebook" | "youtube" | "custom";

export type StorageLocation =
  | "browser_indexeddb"
  | "local_filesystem"
  | "download_prompt";

export type SceneLayoutMode =
  | "single"
  | "split_50_50"
  | "pip_bottom_right"
  | "pip_top_right"
  | "quad_grid";

export type WirelessDevicePlatform = "iphone" | "android";

export interface SavedWirelessCamera {
  id: string;
  name: string;
  platform: WirelessDevicePlatform;
  roomCode: string;
  ipUrl?: string;
  createdAt: string;
}

export interface SceneCameraSlot {
  id: string;
  label: string;
  sourceType: "camera" | "screen" | "court_sim" | "wireless_phone";
  deviceId: string;
  angleName: string;
  wirelessRoomCode?: string;
  wirelessIpUrl?: string;
  wirelessPlatform?: WirelessDevicePlatform;
  savedWirelessCamId?: string;
}

export interface ReplayClipConfig {
  videoId: string;
  videoTitle: string;
  startSec: number;
  endSec: number;
  playbackRate: number;
}

export interface SceneMediaConfig {
  mediaType: "video" | "picture";
  url: string;
  fileName: string;
  loop?: boolean;
  muted?: boolean;
  objectFit?: "contain" | "cover";
}

export interface StudioScene {
  id: string;
  name: string;
  kind: "camera_scene" | "replay_scene" | "video_scene" | "picture_scene";
  layout: SceneLayoutMode;
  cameras: SceneCameraSlot[];
  replayConfig?: ReplayClipConfig;
  mediaConfig?: SceneMediaConfig;
}

export interface StudioAudioSource {
  id: string;
  name: string;
  kind: "mic_input" | "audio_file";
  deviceId?: string;
  fileUrl?: string;
  fileName?: string;
  volume: number; // 0 to 1.5
  muted: boolean;
  loop?: boolean;
  isActive: boolean;
}

/**
 * Scorebug Team Name Rule:
 * Use Team Initials if defined on the team; otherwise use ONLY the first word of the team name.
 */
function getScorebugTeamDisplay(
  team: { name?: string; initials?: string } | null | undefined,
  fallbackFullName: string
): string {
  const initials = team?.initials?.trim();
  if (initials) {
    return initials.toUpperCase();
  }
  const full = (team?.name || fallbackFullName || "TEAM").trim();
  const firstWord = full.split(/\s+/)[0] || full;
  return firstWord.toUpperCase();
}

const DEFAULT_SCENES: StudioScene[] = [
  {
    id: "scene-main-1cam",
    name: "Scene 1: Main Court (1 Cam)",
    kind: "camera_scene",
    layout: "single",
    cameras: [
      {
        id: "cam-slot-1",
        label: "Camera 1 (Center Court)",
        sourceType: "camera",
        deviceId: "",
        angleName: "CAM 1 • CENTER COURT",
      },
    ],
  },
  {
    id: "scene-dual-2cam",
    name: "Scene 2: Dual Camera Split (2 Cams)",
    kind: "camera_scene",
    layout: "split_50_50",
    cameras: [
      {
        id: "cam-slot-2a",
        label: "Camera 1 (Main Wide)",
        sourceType: "camera",
        deviceId: "",
        angleName: "CAM 1 • WIDE",
      },
      {
        id: "cam-slot-2b",
        label: "Camera 2 (Baseline / Rim)",
        sourceType: "court_sim",
        deviceId: "",
        angleName: "CAM 2 • BASELINE",
      },
    ],
  },
  {
    id: "scene-pip-2cam",
    name: "Scene 3: Court + Coach PiP (2 Cams)",
    kind: "camera_scene",
    layout: "pip_bottom_right",
    cameras: [
      {
        id: "cam-slot-3a",
        label: "Camera 1 (Main Court)",
        sourceType: "camera",
        deviceId: "",
        angleName: "CAM 1 • MAIN",
      },
      {
        id: "cam-slot-3b",
        label: "Camera 2 (Bench / Rim PiP)",
        sourceType: "court_sim",
        deviceId: "",
        angleName: "CAM 2 • BENCH PIP",
      },
    ],
  },
  {
    id: "scene-quad-4cam",
    name: "Scene 4: Multi-Cam Quad (4 Cams)",
    kind: "camera_scene",
    layout: "quad_grid",
    cameras: [
      {
        id: "cam-slot-4a",
        label: "Camera 1 (Center)",
        sourceType: "camera",
        deviceId: "",
        angleName: "CAM 1 • CENTER",
      },
      {
        id: "cam-slot-4b",
        label: "Camera 2 (Left Rim)",
        sourceType: "court_sim",
        deviceId: "",
        angleName: "CAM 2 • LEFT RIM",
      },
      {
        id: "cam-slot-4c",
        label: "Camera 3 (Right Rim)",
        sourceType: "court_sim",
        deviceId: "",
        angleName: "CAM 3 • RIGHT RIM",
      },
      {
        id: "cam-slot-4d",
        label: "Camera 4 (Scorers Table)",
        sourceType: "court_sim",
        deviceId: "",
        angleName: "CAM 4 • TABLE",
      },
    ],
  },
];

function LiveBroadcastStudioContent() {
  const searchParams = useSearchParams();
  const initialLeagueId = searchParams.get("leagueId");
  const initialMatchId = searchParams.get("matchId");

  const {
    leagues,
    teams,
    tournamentsByLeagueId,
    gameSessionsByMatchId,
    initializeSession,
    fetchLeaguesAndTeams,
    syncFromLocalStorage,
    updateTeamInLeague,
  } = useBoxScoreStore();

  // Selected League & Match
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  // OBS Scenes State (Preview on Left, Live Program on Right)
  const [scenes, setScenes] = useState<StudioScene[]>(DEFAULT_SCENES);
  const [previewSceneId, setPreviewSceneId] = useState<string>("scene-main-1cam");
  const [liveSceneId, setLiveSceneId] = useState<string>("scene-main-1cam");
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [showOverlayInPreview, setShowOverlayInPreview] = useState<boolean>(true);
  const [newSceneNameInput, setNewSceneNameInput] = useState<string>("");

  // Custom / League Logo Transition (Stinger Wipe) State & Refs
  const [customTransitionLogoUrl, setCustomTransitionLogoUrl] = useState<string>("");
  const transitionLogoImgRef = useRef<HTMLImageElement | null>(null);
  const stingerStateRef = useRef<{
    active: boolean;
    startMs: number;
    durationMs: number;
    switchedScene: boolean;
    targetSceneId: string;
  }>({
    active: false,
    startMs: 0,
    durationMs: 850,
    switchedScene: false,
    targetSceneId: "",
  });

  // Audio Sources & Mixer State (Microphones + Uploaded Audio Files / BGM / SFX)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioSources, setAudioSources] = useState<StudioAudioSource[]>([
    {
      id: "audio-mic-main",
      name: "Mic / Commentator 1",
      kind: "mic_input",
      deviceId: "",
      volume: 1.0,
      muted: false,
      isActive: false,
    },
  ]);
  const [audioLevelsById, setAudioLevelsById] = useState<Record<string, number>>({});
  const audioStreamByIdRef = useRef<Record<string, MediaStream>>({});
  const audioElByIdRef = useRef<Record<string, HTMLAudioElement>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainNodeByIdRef = useRef<Record<string, GainNode>>({});
  const analyserByIdRef = useRef<Record<string, AnalyserNode>>({});

  // Hardware Video Devices & Active Streams Map (keyed by slot.id AND shared by wireless roomCode)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeSlotIds, setActiveSlotIds] = useState<Record<string, boolean>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamBySlotRef = useRef<Record<string, MediaStream>>({});
  const videoElBySlotRef = useRef<Record<string, HTMLVideoElement>>({});
  const wirelessFrameImgBySlotRef = useRef<Record<string, HTMLImageElement>>({});
  const wirelessPcBySlotRef = useRef<Record<string, RTCPeerConnection>>({});
  const wirelessChannelBySlotRef = useRef<
    Record<string, ReturnType<typeof supabase.channel>>
  >({});
  const [wirelessStatusBySlot, setWirelessStatusBySlot] = useState<
    Record<string, "waiting" | "webrtc" | "relay" | "ip">
  >({});

  // Shared Wireless Camera Streams & Channels keyed by normalized Room Code (so any Scene can use a saved iPhone/Android camera simultaneously)
  const wirelessStreamByRoomRef = useRef<Record<string, MediaStream>>({});
  const wirelessVideoElByRoomRef = useRef<Record<string, HTMLVideoElement>>({});
  const wirelessFrameImgByRoomRef = useRef<Record<string, HTMLImageElement>>({});
  const wirelessPcByRoomRef = useRef<Record<string, RTCPeerConnection>>({});
  const wirelessChannelByRoomRef = useRef<
    Record<string, ReturnType<typeof supabase.channel>>
  >({});
  const [wirelessStatusByRoom, setWirelessStatusByRoom] = useState<
    Record<string, "waiting" | "webrtc" | "relay" | "ip">
  >({});

  // Saved iPhone & Android Wireless Cameras (reusable across all Scenes & persisted in localStorage)
  const [savedWirelessCameras, setSavedWirelessCameras] = useState<
    SavedWirelessCamera[]
  >([]);
  const [wirelessCamNotice, setWirelessCamNotice] = useState<string | null>(
    null
  );

  const [pairingWirelessSlot, setPairingWirelessSlot] = useState<{
    sceneId: string;
    slotId: string;
  } | null>(null);

  // Scorebug Overlay Customization
  const [scorebugPosition, setScorebugPosition] = useState<
    "bottom_bar" | "bottom_left" | "top_corner"
  >("bottom_bar");
  const [scorebugTheme, setScorebugTheme] = useState<"broadcast_dark" | "clean_light">("broadcast_dark");
  const [showShotClock, setShowShotClock] = useState<boolean>(true);
  const [showSponsorTag, setShowSponsorTag] = useState<boolean>(true);
  const [sponsorText, setSponsorText] = useState<string>("BOX SCORE LIVE");
  const [manualHomeTimeouts, setManualHomeTimeouts] = useState<number>(2);
  const [manualAwayTimeouts, setManualAwayTimeouts] = useState<number>(2);
  const [manualHomePenaltyOverride, setManualHomePenaltyOverride] = useState<boolean | null>(null);
  const [manualAwayPenaltyOverride, setManualAwayPenaltyOverride] = useState<boolean | null>(null);

  // Live On-Court Player Stats Overlay State (Controlled in Live — shows non-zero stats in the middle of the feed)
  const [liveFeaturedPlayerId, setLiveFeaturedPlayerId] = useState<string | null>(null);

  // Team Logo & Featured Player Image Refs for Canvas Rendering
  const homeLogoImgRef = useRef<HTMLImageElement | null>(null);
  const awayLogoImgRef = useRef<HTMLImageElement | null>(null);
  const featuredPlayerImgRef = useRef<HTMLImageElement | null>(null);
  const mediaImageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  // Recording & Live Timeline State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [liveRecordingFrames, setLiveRecordingFrames] = useState<TimelineFrame[]>([]);
  const [storageLocation, setStorageLocation] = useState<StorageLocation>("browser_indexeddb");

  // Saved Recordings & Bottom Camera Timeline State
  const [storedVideos, setStoredVideos] = useState<StoredGameVideo[]>([]);
  const [selectedTimelineVideoId, setSelectedTimelineVideoId] = useState<string>("");
  const [timelinePlayheadSec, setTimelinePlayheadSec] = useState<number>(0);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(10);
  const [replayBoxDurationPreset, setReplayBoxDurationPreset] = useState<number>(10);
  const [timelineZoomPxPerSec, setTimelineZoomPxPerSec] = useState<number>(64);
  const [clockSearchQuery, setClockSearchQuery] = useState<string>("");
  const [customTagInput, setCustomTagInput] = useState<string>("");
  const [liveClockTags, setLiveClockTags] = useState<TimelineClockTag[]>([]);
  const [activeDragMode, setActiveDragMode] = useState<
    "playhead" | "box_move" | "box_left" | "box_right" | null
  >(null);
  const [selectedReplaySpeed, setSelectedReplaySpeed] = useState<number>(0.5);
  const [replayClipLabel, setReplayClipLabel] = useState<string>("");
  const [timelineNotice, setTimelineNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPlayingInspectorReplay, setIsPlayingInspectorReplay] = useState<boolean>(false);
  const playEventRecSecMapRef = useRef<Record<string, number>>({});
  const lastSeenPlayEventIdsRef = useRef<Set<string>>(new Set());

  // Facebook Page / YouTube Live Direct RTMPS Streaming State
  const [streamPlatform, setStreamPlatform] = useState<StreamPlatform>("facebook");
  const [rtmpServerUrl, setRtmpServerUrl] = useState<string>(
    "rtmps://live-api-s.facebook.com:443/rtmp/"
  );
  const [streamKey, setStreamKey] = useState<string>("");
  const [showStreamKey, setShowStreamKey] = useState<boolean>(false);
  const [isStreamingLive, setIsStreamingLive] = useState<boolean>(false);
  const [isConnectingStream, setIsConnectingStream] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamDurationSec, setStreamDurationSec] = useState<number>(0);
  const [streamFramesSent, setStreamFramesSent] = useState<number>(0);
  const [streamBytesSent, setStreamBytesSent] = useState<number>(0);
  const [showFbSetupModal, setShowFbSetupModal] = useState<boolean>(false);

  // Canvas & Video Refs
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneThumbCanvasByIdRef = useRef<Record<string, HTMLCanvasElement | null>>({});
  const previewReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewMediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveMediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrubVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveCaptureFramesRef = useRef<TimelineFrame[]>([]);
  const liveClockTagsRef = useRef<TimelineClockTag[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  // Timeline Scroll, Zoom & Pointer-Capture Drag Refs
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackInnerRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetSecRef = useRef<number>(0);
  const dragBoxWidthSecRef = useRef<number>(10);

  // Live Game Clock & Score Refs for Real-Time Frame Tagging during Recording
  const liveClockStateRef = useRef<{
    period: number;
    clockSeconds: number;
    homeScore: number;
    awayScore: number;
  }>({
    period: 1,
    clockSeconds: 600,
    homeScore: 0,
    awayScore: 0,
  });

  // RTMP WebCodecs Encoder Refs
  const rtmpSessionIdRef = useRef<string>(`rtmp-${generateUUID().slice(0, 8)}`);
  const videoEncoderRef = useRef<{
    encode: (frame: unknown, opts?: { keyFrame?: boolean }) => void;
    close: () => void;
    state: string;
  } | null>(null);
  const encoderLoopRef = useRef<NodeJS.Timeout | null>(null);
  const flushLoopRef = useRef<NodeJS.Timeout | null>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const avcConfigBase64Ref = useRef<string | undefined>(undefined);
  const pendingRtmpFramesRef = useRef<
    Array<{ timestampMs: number; isKeyframe: boolean; dataBase64: string }>
  >([]);
  const isFlushingRtmpRef = useRef<boolean>(false);
  const streamStartTimeRef = useRef<number>(0);
  const streamFrameCountRef = useRef<number>(0);
  const encoderCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize DB, Realtime & Stored Videos
  const refreshStoredVideos = useCallback(async () => {
    const list = await getAllStoredVideos();
    setStoredVideos(list);
    if (list.length > 0 && !selectedTimelineVideoId) {
      const first = list[0];
      setSelectedTimelineVideoId(first.id);
      setTrimStartSec(0);
      setTrimEndSec(Math.max(2, Math.min(first.durationSeconds || 8, 10)));
    }
  }, [selectedTimelineVideoId]);

  useEffect(() => {
    initializeSession();
    fetchLeaguesAndTeams();
    refreshStoredVideos();

    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("boxscore")) {
        syncFromLocalStorage();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [initializeSession, fetchLeaguesAndTeams, syncFromLocalStorage, refreshStoredVideos]);

  // Select Initial League
  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      if (initialLeagueId && leagues.some((l) => l.id === initialLeagueId)) {
        setSelectedLeagueId(initialLeagueId);
      } else {
        setSelectedLeagueId(leagues[0].id);
      }
    }
  }, [leagues, initialLeagueId, selectedLeagueId]);

  const activeLeague = useMemo(() => {
    return leagues.find((l) => l.id === selectedLeagueId) ?? leagues[0] ?? null;
  }, [leagues, selectedLeagueId]);

  const matches = useMemo(() => {
    if (!activeLeague) return [];
    return tournamentsByLeagueId[activeLeague.id]?.matches ?? [];
  }, [activeLeague, tournamentsByLeagueId]);

  useEffect(() => {
    if (matches.length > 0) {
      if (initialMatchId && matches.some((m) => m.id === initialMatchId)) {
        setSelectedMatchId(initialMatchId);
      } else if (!selectedMatchId || !matches.some((m) => m.id === selectedMatchId)) {
        setSelectedMatchId(matches[0].id);
      }
    } else {
      setSelectedMatchId("");
    }
  }, [matches, initialMatchId, selectedMatchId]);

  const activeMatch = useMemo(() => {
    return matches.find((m) => m.id === selectedMatchId) ?? matches[0] ?? null;
  }, [matches, selectedMatchId]);

  const liveSession: LiveGameSession | null = useMemo(() => {
    if (!activeMatch) return null;
    return gameSessionsByMatchId[activeMatch.id] ?? null;
  }, [activeMatch, gameSessionsByMatchId]);

  const homeTeam = useMemo(() => {
    if (!activeMatch) return null;
    return teams.find((t) => t.id === activeMatch.homeTeamId) ?? null;
  }, [activeMatch, teams]);

  const awayTeam = useMemo(() => {
    if (!activeMatch) return null;
    return teams.find((t) => t.id === activeMatch.awayTeamId) ?? null;
  }, [activeMatch, teams]);

  const homeScore = liveSession?.homeScore ?? activeMatch?.homeScore ?? 0;
  const awayScore = liveSession?.awayScore ?? activeMatch?.awayScore ?? 0;
  const clockSeconds = liveSession?.clockSecondsRemaining ?? 600;
  const shotClock = liveSession?.shotClockSeconds ?? 24;
  const period = liveSession?.currentPeriod ?? 1;
  const isClockRunning = liveSession?.isClockRunning ?? false;

  const homeTeamName = homeTeam?.name ?? activeMatch?.homeTeamPlaceholder ?? "HOME";
  const awayTeamName = awayTeam?.name ?? activeMatch?.awayTeamPlaceholder ?? "AWAY";
  // Scorebug Team Name: Team Initials if set; otherwise the first word of the team name
  const homeScorebugName = getScorebugTeamDisplay(homeTeam, homeTeamName);
  const awayScorebugName = getScorebugTeamDisplay(awayTeam, awayTeamName);
  const homeColor = homeTeam?.primaryColor ?? "#8B0D0E";
  const awayColor = awayTeam?.primaryColor ?? "#0B2F5C";

  // Timeouts & Team Penalty / Bonus Status for Scorebug
  const currentPeriodIndex = Math.max(0, period - 1);
  const bonusThreshold = activeLeague?.rulesConfig?.teamFoulBonusThreshold ?? 5;
  const homePeriodFouls =
    liveSession?.homeTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const awayPeriodFouls =
    liveSession?.awayTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const homeTimeoutsRemaining =
    liveSession?.homeTimeoutsRemaining ?? manualHomeTimeouts;
  const awayTimeoutsRemaining =
    liveSession?.awayTimeoutsRemaining ?? manualAwayTimeouts;
  const isHomeInPenalty =
    manualHomePenaltyOverride !== null
      ? manualHomePenaltyOverride
      : homePeriodFouls >= bonusThreshold;
  const isAwayInPenalty =
    manualAwayPenaltyOverride !== null
      ? manualAwayPenaltyOverride
      : awayPeriodFouls >= bonusThreshold;

  // On-Court Players Selection for Live Player Stats Feed Overlay (ONLY players on the court!)
  const onCourtAwayPlayers: Array<PlayerGameStats & { teamSide: "AWAY"; teamName: string; teamShortName: string; teamColor: string }> = useMemo(() => {
    if (liveSession?.awayPlayerStats) {
      const list = Object.values(liveSession.awayPlayerStats).filter((p) => p.isOnCourt);
      if (list.length > 0) {
        return list.map((p) => ({
          ...p,
          teamSide: "AWAY" as const,
          teamName: awayTeamName,
          teamShortName: awayScorebugName,
          teamColor: awayColor,
        }));
      }
    }
    return (awayTeam?.roster ?? []).slice(0, 5).map((r) => ({
      playerId: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      jerseyNumber: r.jerseyNumber,
      position: r.position,
      imageUrl: r.imageUrl,
      isOnCourt: true,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      techFouls: 0,
      teamSide: "AWAY" as const,
      teamName: awayTeamName,
      teamShortName: awayScorebugName,
      teamColor: awayColor,
    }));
  }, [liveSession?.awayPlayerStats, awayTeam?.roster, awayTeamName, awayScorebugName, awayColor]);

  const onCourtHomePlayers: Array<PlayerGameStats & { teamSide: "HOME"; teamName: string; teamShortName: string; teamColor: string }> = useMemo(() => {
    if (liveSession?.homePlayerStats) {
      const list = Object.values(liveSession.homePlayerStats).filter((p) => p.isOnCourt);
      if (list.length > 0) {
        return list.map((p) => ({
          ...p,
          teamSide: "HOME" as const,
          teamName: homeTeamName,
          teamShortName: homeScorebugName,
          teamColor: homeColor,
        }));
      }
    }
    return (homeTeam?.roster ?? []).slice(0, 5).map((r) => ({
      playerId: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      jerseyNumber: r.jerseyNumber,
      position: r.position,
      imageUrl: r.imageUrl,
      isOnCourt: true,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      techFouls: 0,
      teamSide: "HOME" as const,
      teamName: homeTeamName,
      teamShortName: homeScorebugName,
      teamColor: homeColor,
    }));
  }, [liveSession?.homePlayerStats, homeTeam?.roster, homeTeamName, homeScorebugName, homeColor]);

  const allOnCourtPlayers = useMemo(
    () => [...onCourtAwayPlayers, ...onCourtHomePlayers],
    [onCourtAwayPlayers, onCourtHomePlayers]
  );

  const featuredOnCourtPlayer = useMemo(() => {
    if (!liveFeaturedPlayerId) return null;
    return allOnCourtPlayers.find((p) => p.playerId === liveFeaturedPlayerId) ?? null;
  }, [allOnCourtPlayers, liveFeaturedPlayerId]);

  // If the selected player was subbed off the court, auto-clear the overlay
  useEffect(() => {
    if (liveFeaturedPlayerId && !featuredOnCourtPlayer) {
      setLiveFeaturedPlayerId(null);
    }
  }, [liveFeaturedPlayerId, featuredOnCourtPlayer]);

  // Load Featured On-Court Player Image into CORS-safe HTMLImageElement
  useEffect(() => {
    const rawUrl = featuredOnCourtPlayer?.imageUrl;
    if (!rawUrl || !rawUrl.trim()) {
      featuredPlayerImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      img.src = `/api/image-proxy?url=${encodeURIComponent(trimmed)}`;
    } else {
      img.src = trimmed;
    }
    featuredPlayerImgRef.current = img;
  }, [featuredOnCourtPlayer?.imageUrl]);

  // Active Preview & Live Scene objects
  const previewScene = useMemo(
    () => scenes.find((s) => s.id === previewSceneId) ?? scenes[0],
    [scenes, previewSceneId]
  );
  const liveScene = useMemo(
    () => scenes.find((s) => s.id === liveSceneId) ?? scenes[0],
    [scenes, liveSceneId]
  );

  // Selected Timeline Video
  const selectedTimelineVideo = useMemo(
    () => storedVideos.find((v) => v.id === selectedTimelineVideoId) ?? storedVideos[0] ?? null,
    [storedVideos, selectedTimelineVideoId]
  );

  // Enumerate Camera & Audio Input Devices
  const refreshCameraDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vInputs = devices.filter((d) => d.kind === "videoinput");
      const aInputs = devices.filter((d) => d.kind === "audioinput");
      setVideoDevices(vInputs);
      setAudioDevices(aInputs);
    } catch {
      // Ignore before permissions granted
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
    if (typeof window !== "undefined") {
      try {
        const savedLogo = window.localStorage.getItem(
          "boxscore_studio_transition_logo"
        );
        if (savedLogo) setCustomTransitionLogoUrl(savedLogo);
      } catch {
        // ignore
      }
    }
  }, [refreshCameraDevices]);

  // Active Transition Logo URL (Uploaded Custom Logo -> Active League Logo)
  const effectiveTransitionLogoUrl =
    customTransitionLogoUrl.trim() || activeLeague?.imageUrl?.trim() || "";

  // Load Transition Logo into CORS-safe HTMLImageElement for Stinger Wipe Rendering
  useEffect(() => {
    if (!effectiveTransitionLogoUrl) {
      transitionLogoImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    if (
      effectiveTransitionLogoUrl.startsWith("http://") ||
      effectiveTransitionLogoUrl.startsWith("https://")
    ) {
      img.src = `/api/image-proxy?url=${encodeURIComponent(
        effectiveTransitionLogoUrl
      )}`;
    } else {
      img.src = effectiveTransitionLogoUrl;
    }
    transitionLogoImgRef.current = img;
  }, [effectiveTransitionLogoUrl]);

  // Upload Custom Transition Logo (e.g. League Logo)
  const handleUploadTransitionLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) {
        setCustomTransitionLogoUrl(dataUrl);
        try {
          window.localStorage.setItem("boxscore_studio_transition_logo", dataUrl);
        } catch {
          // ignore if quota exceeded
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Web Audio API Master Mixer & Audio Source Handlers
  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      audioCtxRef.current = ctx;
      masterAudioDestRef.current = dest;
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume().catch(() => {});
    }
    return {
      ctx: audioCtxRef.current,
      dest: masterAudioDestRef.current!,
    };
  }, []);

  const startAudioSource = async (src: StudioAudioSource) => {
    const audioEnv = ensureAudioContext();
    if (!audioEnv) return;
    const { ctx, dest } = audioEnv;

    if (src.kind === "mic_input") {
      try {
        if (audioStreamByIdRef.current[src.id]) {
          audioStreamByIdRef.current[src.id].getTracks().forEach((t) => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: src.deviceId ? { deviceId: { exact: src.deviceId } } : true,
          video: false,
        });
        audioStreamByIdRef.current[src.id] = stream;

        const mediaSource = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = src.muted ? 0 : src.volume;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        mediaSource.connect(gainNode);
        gainNode.connect(analyser);
        gainNode.connect(dest);

        gainNodeByIdRef.current[src.id] = gainNode;
        analyserByIdRef.current[src.id] = analyser;

        setAudioSources((prev) =>
          prev.map((a) => (a.id === src.id ? { ...a, isActive: true } : a))
        );
        await refreshCameraDevices();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not access microphone.";
        setCameraError(`Audio Error: ${msg}`);
      }
    } else if (src.kind === "audio_file" && src.fileUrl) {
      try {
        let audioEl = audioElByIdRef.current[src.id];
        if (!audioEl) {
          audioEl = new Audio(src.fileUrl);
          audioEl.crossOrigin = "anonymous";
          audioElByIdRef.current[src.id] = audioEl;

          const mediaSource = ctx.createMediaElementSource(audioEl);
          const gainNode = ctx.createGain();
          gainNode.gain.value = src.muted ? 0 : src.volume;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;

          mediaSource.connect(gainNode);
          gainNode.connect(analyser);
          gainNode.connect(dest);
          // Also route to local speakers so operator hears the BGM/SFX
          gainNode.connect(ctx.destination);

          gainNodeByIdRef.current[src.id] = gainNode;
          analyserByIdRef.current[src.id] = analyser;
        }
        audioEl.loop = Boolean(src.loop);
        await audioEl.play();
        setAudioSources((prev) =>
          prev.map((a) => (a.id === src.id ? { ...a, isActive: true } : a))
        );
      } catch {
        // ignore
      }
    }
  };

  const stopAudioSource = (sourceId: string) => {
    if (audioStreamByIdRef.current[sourceId]) {
      audioStreamByIdRef.current[sourceId].getTracks().forEach((t) => t.stop());
      delete audioStreamByIdRef.current[sourceId];
    }
    if (audioElByIdRef.current[sourceId]) {
      audioElByIdRef.current[sourceId].pause();
    }
    delete analyserByIdRef.current[sourceId];
    setAudioLevelsById((prev) => ({ ...prev, [sourceId]: 0 }));
    setAudioSources((prev) =>
      prev.map((a) => (a.id === sourceId ? { ...a, isActive: false } : a))
    );
  };

  const handleUpdateAudioSource = (
    sourceId: string,
    patch: Partial<StudioAudioSource>
  ) => {
    setAudioSources((prev) =>
      prev.map((a) => {
        if (a.id !== sourceId) return a;
        const updated = { ...a, ...patch };
        const gainNode = gainNodeByIdRef.current[sourceId];
        if (gainNode) {
          gainNode.gain.value = updated.muted ? 0 : updated.volume;
        }
        const audioEl = audioElByIdRef.current[sourceId];
        if (audioEl && patch.loop !== undefined) {
          audioEl.loop = Boolean(patch.loop);
        }
        return updated;
      })
    );
  };

  const handleAddMicAudioSource = () => {
    const nextIdx =
      audioSources.filter((a) => a.kind === "mic_input").length + 1;
    const newAudio: StudioAudioSource = {
      id: `audio-mic-${generateUUID().slice(0, 6)}`,
      name: `Mic / Commentator ${nextIdx}`,
      kind: "mic_input",
      deviceId: audioDevices[0]?.deviceId || "",
      volume: 1.0,
      muted: false,
      isActive: false,
    };
    setAudioSources((prev) => [...prev, newAudio]);
  };

  const handleAddFileAudioSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const newAudio: StudioAudioSource = {
      id: `audio-file-${generateUUID().slice(0, 6)}`,
      name: `🎵 ${cleanName.slice(0, 22)}`,
      kind: "audio_file",
      fileUrl: url,
      fileName: file.name,
      volume: 0.85,
      muted: false,
      loop: true,
      isActive: false,
    };
    setAudioSources((prev) => [...prev, newAudio]);
    e.target.value = "";
  };

  const handleRemoveAudioSource = (sourceId: string) => {
    stopAudioSource(sourceId);
    if (audioElByIdRef.current[sourceId]) {
      delete audioElByIdRef.current[sourceId];
    }
    setAudioSources((prev) => prev.filter((a) => a.id !== sourceId));
  };

  // Real-time Audio Level Meter (VU Meter) Polling Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const analysers = analyserByIdRef.current;
      const ids = Object.keys(analysers);
      if (ids.length === 0) return;

      const nextLevels: Record<string, number> = {};
      const dataArray = new Uint8Array(64);
      for (const id of ids) {
        const an = analysers[id];
        if (!an) continue;
        an.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        nextLevels[id] = Math.min(100, Math.round((avg / 140) * 100));
      }
      setAudioLevelsById(nextLevels);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Keep liveClockStateRef synced with current Game Clock & Score for real-time frame tagging
  useEffect(() => {
    liveClockStateRef.current = {
      period,
      clockSeconds,
      homeScore,
      awayScore,
    };
  }, [period, clockSeconds, homeScore, awayScore]);

  // Load Home & Away Team Logos into CORS-safe HTMLImageElements for Scorebug Canvas Rendering
  useEffect(() => {
    const loadLogoImage = (
      rawUrl: string | undefined,
      targetRef: React.MutableRefObject<HTMLImageElement | null>
    ) => {
      if (!rawUrl || !rawUrl.trim()) {
        targetRef.current = null;
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      const trimmed = rawUrl.trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        img.src = `/api/image-proxy?url=${encodeURIComponent(trimmed)}`;
      } else {
        img.src = trimmed;
      }
      targetRef.current = img;
    };

    loadLogoImage(homeTeam?.imageUrl, homeLogoImgRef);
    loadLogoImage(awayTeam?.imageUrl, awayLogoImgRef);
  }, [homeTeam?.imageUrl, awayTeam?.imageUrl]);

  // Auto-map incoming Live Play-by-Play events to exact recording second on the Camera Timeline
  useEffect(() => {
    const events = liveSession?.playEvents || [];
    for (const ev of events) {
      if (!lastSeenPlayEventIdsRef.current.has(ev.id)) {
        lastSeenPlayEventIdsRef.current.add(ev.id);
        if (isRecording) {
          playEventRecSecMapRef.current[ev.id] = recordSeconds;
          const autoTag: TimelineClockTag = {
            id: `pbp-${ev.id}`,
            recTimeSec: recordSeconds,
            gameClockLabel: `${ev.periodLabel} ${ev.gameClockDisplay}`,
            scoreLabel: `${ev.awayScoreAfter}-${ev.homeScoreAfter}`,
            label: `${ev.teamName.slice(0, 3).toUpperCase()}: ${ev.description}`,
          };
          const nextTags = [...liveClockTagsRef.current, autoTag];
          liveClockTagsRef.current = nextTags;
          setLiveClockTags(nextTags);
        }
      }
    }
  }, [liveSession?.playEvents, isRecording, recordSeconds]);

  // Ensure hidden <video> element exists for each camera slot
  const getOrCreateSlotVideoElement = (slotId: string): HTMLVideoElement => {
    if (!videoElBySlotRef.current[slotId]) {
      const vid = document.createElement("video");
      vid.playsInline = true;
      vid.muted = true;
      vid.autoplay = true;
      videoElBySlotRef.current[slotId] = vid;
    }
    return videoElBySlotRef.current[slotId];
  };

  // Ensure shared hidden <video> element exists for a wireless Room Code so multiple Scenes can render the same iPhone/Android camera
  const getOrCreateRoomVideoElement = (roomCode: string): HTMLVideoElement => {
    const clean = roomCode.trim().toUpperCase();
    if (!wirelessVideoElByRoomRef.current[clean]) {
      const vid = document.createElement("video");
      vid.playsInline = true;
      vid.muted = true;
      vid.autoplay = true;
      wirelessVideoElByRoomRef.current[clean] = vid;
    }
    return wirelessVideoElByRoomRef.current[clean];
  };

  // Connect Wireless Phone Camera (iPhone / Android) via Supabase Realtime + WebRTC / Frame Relay (shared by Room Code across all Scenes)
  const connectWirelessPhoneSlot = useCallback(
    (slot: SceneCameraSlot, forceReconnect = false) => {
      const roomCode = (
        slot.wirelessRoomCode || `CAM${slot.id.slice(-4).toUpperCase()}`
      )
        .trim()
        .toUpperCase();

      // Optional Direct IP Camera MJPEG URL (e.g. Android IP Webcam http://192.168.1.50:8080/video)
      if (slot.wirelessIpUrl && slot.wirelessIpUrl.trim()) {
        const ipImg = new Image();
        ipImg.crossOrigin = "anonymous";
        ipImg.src = slot.wirelessIpUrl.trim();
        wirelessFrameImgBySlotRef.current[slot.id] = ipImg;
        wirelessFrameImgByRoomRef.current[roomCode] = ipImg;
        setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
        setWirelessStatusBySlot((prev) => ({ ...prev, [slot.id]: "ip" }));
        setWirelessStatusByRoom((prev) => ({ ...prev, [roomCode]: "ip" }));
        return;
      }

      setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));

      // If this Room Code is already connected (e.g. from another Scene or Saved Wireless Cameras) and no forced reconnect is requested, reuse the live stream!
      if (!forceReconnect && wirelessChannelByRoomRef.current[roomCode]) {
        const existingStream = wirelessStreamByRoomRef.current[roomCode];
        if (existingStream) {
          streamBySlotRef.current[slot.id] = existingStream;
          const vidEl = getOrCreateSlotVideoElement(slot.id);
          if (vidEl.srcObject !== existingStream) {
            vidEl.srcObject = existingStream;
            void vidEl.play().catch(() => {});
          }
        }
        const existingImg = wirelessFrameImgByRoomRef.current[roomCode];
        if (existingImg) {
          wirelessFrameImgBySlotRef.current[slot.id] = existingImg;
        }
        setWirelessStatusByRoom((prev) => {
          const roomSt = prev[roomCode] || "waiting";
          setWirelessStatusBySlot((sPrev) => ({ ...sPrev, [slot.id]: roomSt }));
          return prev;
        });
        // Ping phone in case it is waiting to send a WebRTC offer
        if (!wirelessStreamByRoomRef.current[roomCode]) {
          void wirelessChannelByRoomRef.current[roomCode].send({
            type: "broadcast",
            event: "studio_ready",
            payload: { roomCode },
          });
        }
        return;
      }

      // Clean up existing channel / PeerConnection for this Room Code before creating a fresh connection
      if (wirelessPcByRoomRef.current[roomCode]) {
        wirelessPcByRoomRef.current[roomCode].close();
        delete wirelessPcByRoomRef.current[roomCode];
      }
      if (wirelessChannelByRoomRef.current[roomCode]) {
        void supabase.removeChannel(wirelessChannelByRoomRef.current[roomCode]);
        delete wirelessChannelByRoomRef.current[roomCode];
      }

      setWirelessStatusBySlot((prev) => ({ ...prev, [slot.id]: "waiting" }));
      setWirelessStatusByRoom((prev) => ({ ...prev, [roomCode]: "waiting" }));

      const syncDetectedPhonePlatform = (rawPlatform?: unknown) => {
        if (rawPlatform !== "iphone" && rawPlatform !== "android") return;
        const validPlatform: WirelessDevicePlatform = rawPlatform;
        setScenes((prev) =>
          prev.map((sc) => ({
            ...sc,
            cameras: sc.cameras.map((c) =>
              (c.wirelessRoomCode || "").trim().toUpperCase() === roomCode &&
              c.wirelessPlatform !== validPlatform
                ? { ...c, wirelessPlatform: validPlatform }
                : c
            ),
          }))
        );
        setSavedWirelessCameras((prev) => {
          const hasMatch = prev.some(
            (w) =>
              w.roomCode.toUpperCase() === roomCode &&
              w.platform !== validPlatform
          );
          if (!hasMatch) return prev;
          const updated: SavedWirelessCamera[] = prev.map((w) =>
            w.roomCode.toUpperCase() === roomCode
              ? { ...w, platform: validPlatform }
              : w
          );
          try {
            window.localStorage.setItem(
              "boxscore_saved_wireless_cameras",
              JSON.stringify(updated)
            );
          } catch {
            // ignore
          }
          return updated;
        });
      };

      const ch = supabase.channel(`boxscore-wireless-cam-${roomCode}`, {
        config: { broadcast: { self: false } },
      });
      wirelessChannelByRoomRef.current[roomCode] = ch;
      wirelessChannelBySlotRef.current[slot.id] = ch;

      ch.on("broadcast", { event: "phone_joined" }, ({ payload }) => {
        syncDetectedPhonePlatform(payload?.devicePlatform);
        void ch.send({
          type: "broadcast",
          event: "studio_ready",
          payload: { roomCode },
        });
      })
        .on("broadcast", { event: "webrtc_offer" }, async ({ payload }) => {
          try {
            if (!payload?.sdp) return;
            syncDetectedPhonePlatform(payload?.devicePlatform);
            if (wirelessPcByRoomRef.current[roomCode]) {
              wirelessPcByRoomRef.current[roomCode].close();
            }
            const pc = new RTCPeerConnection({
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
              ],
            });
            wirelessPcByRoomRef.current[roomCode] = pc;
            wirelessPcBySlotRef.current[slot.id] = pc;

            pc.ontrack = (ev) => {
              const remoteStream = ev.streams?.[0];
              if (remoteStream) {
                wirelessStreamByRoomRef.current[roomCode] = remoteStream;
                const roomVidEl = getOrCreateRoomVideoElement(roomCode);
                roomVidEl.srcObject = remoteStream;
                void roomVidEl.play().catch(() => {});

                streamBySlotRef.current[slot.id] = remoteStream;
                const vidEl = getOrCreateSlotVideoElement(slot.id);
                vidEl.srcObject = remoteStream;
                void vidEl.play().catch(() => {});

                setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
                setWirelessStatusByRoom((prev) => ({
                  ...prev,
                  [roomCode]: "webrtc",
                }));
                setWirelessStatusBySlot((prev) => ({
                  ...prev,
                  [slot.id]: "webrtc",
                }));
              }
            };

            pc.onicecandidate = (ev) => {
              if (ev.candidate) {
                void ch.send({
                  type: "broadcast",
                  event: "webrtc_ice_from_studio",
                  payload: {
                    roomCode,
                    candidate: ev.candidate.toJSON(),
                  },
                });
              }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await ch.send({
              type: "broadcast",
              event: "webrtc_answer",
              payload: {
                roomCode,
                sdp: pc.localDescription,
              },
            });
          } catch {
            // Fallback to frame relay automatically
          }
        })
        .on(
          "broadcast",
          { event: "webrtc_ice_from_phone" },
          async ({ payload }) => {
            try {
              const pc =
                wirelessPcByRoomRef.current[roomCode] ||
                wirelessPcBySlotRef.current[slot.id];
              if (pc && payload?.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              }
            } catch {
              // ignore
            }
          }
        )
        .on("broadcast", { event: "video_frame" }, ({ payload }) => {
          if (!payload?.frameDataUrl) return;
          syncDetectedPhonePlatform(payload?.devicePlatform);
          if (!wirelessFrameImgByRoomRef.current[roomCode]) {
            wirelessFrameImgByRoomRef.current[roomCode] = new Image();
          }
          wirelessFrameImgByRoomRef.current[roomCode].src = payload.frameDataUrl;
          wirelessFrameImgBySlotRef.current[slot.id] =
            wirelessFrameImgByRoomRef.current[roomCode];

          setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
          setWirelessStatusByRoom((prev) =>
            prev[roomCode] === "webrtc"
              ? prev
              : { ...prev, [roomCode]: "relay" }
          );
          setWirelessStatusBySlot((prev) =>
            prev[slot.id] === "webrtc" ? prev : { ...prev, [slot.id]: "relay" }
          );
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void ch.send({
              type: "broadcast",
              event: "studio_ready",
              payload: { roomCode },
            });
          }
        });
    },
    []
  );

  // Start Camera or Screen Stream for a specific Slot
  const startCameraSlot = async (slot: SceneCameraSlot) => {
    setCameraError(null);
    if (slot.sourceType === "court_sim") {
      setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
      return;
    }

    if (slot.sourceType === "wireless_phone") {
      connectWirelessPhoneSlot(slot);
      return;
    }

    try {
      // Stop existing stream on this slot if any
      if (streamBySlotRef.current[slot.id]) {
        streamBySlotRef.current[slot.id].getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream;
      if (slot.sourceType === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
      } else {
        const constraints: MediaStreamConstraints = {
          video: slot.deviceId
            ? { deviceId: { exact: slot.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      streamBySlotRef.current[slot.id] = stream;
      const vidEl = getOrCreateSlotVideoElement(slot.id);
      vidEl.srcObject = stream;
      await vidEl.play().catch(() => {});

      setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
      await refreshCameraDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start camera source.";
      setCameraError(msg);
    }
  };

  const stopCameraSlot = (slotId: string) => {
    const slotStream = streamBySlotRef.current[slotId];
    if (slotStream) {
      // Only stop underlying MediaStream tracks if it is NOT a shared wireless room stream
      const isSharedWirelessStream = Object.values(
        wirelessStreamByRoomRef.current
      ).includes(slotStream);
      if (!isSharedWirelessStream) {
        slotStream.getTracks().forEach((t) => t.stop());
      }
      delete streamBySlotRef.current[slotId];
    }
    if (videoElBySlotRef.current[slotId]) {
      videoElBySlotRef.current[slotId].srcObject = null;
    }
    delete wirelessPcBySlotRef.current[slotId];
    delete wirelessChannelBySlotRef.current[slotId];
    delete wirelessFrameImgBySlotRef.current[slotId];
    setActiveSlotIds((prev) => ({ ...prev, [slotId]: false }));
  };

  // Sync Replay Video Elements when previewScene or liveScene is a Replay Scene
  useEffect(() => {
    const syncReplayElement = (
      scene: StudioScene | undefined,
      vidEl: HTMLVideoElement | null
    ) => {
      if (!vidEl) return;
      if (!scene || scene.kind !== "replay_scene" || !scene.replayConfig) {
        vidEl.pause();
        return;
      }
      const cfg = scene.replayConfig;
      const targetVideo = storedVideos.find((v) => v.id === cfg.videoId);
      if (!targetVideo) return;

      const currentVideoId = vidEl.getAttribute("data-video-id");
      if (currentVideoId !== targetVideo.id) {
        const url = URL.createObjectURL(targetVideo.blob);
        vidEl.src = url;
        vidEl.setAttribute("data-video-id", targetVideo.id);
      }

      vidEl.playbackRate = cfg.playbackRate;
      if (vidEl.currentTime < cfg.startSec || vidEl.currentTime >= cfg.endSec) {
        vidEl.currentTime = cfg.startSec;
      }
      if (vidEl.paused) {
        vidEl.play().catch(() => {});
      }
    };

    syncReplayElement(previewScene, previewReplayVideoRef.current);
    syncReplayElement(liveScene, liveReplayVideoRef.current);
  }, [previewScene, liveScene, storedVideos]);

  // Sync Uploaded Video Scenes & Picture Scenes for Preview and Live Program
  useEffect(() => {
    const syncMediaVideo = (
      scene: StudioScene | undefined,
      vidEl: HTMLVideoElement | null
    ) => {
      if (!vidEl) return;
      if (!scene || scene.kind !== "video_scene" || !scene.mediaConfig) {
        vidEl.pause();
        return;
      }
      const currentSceneId = vidEl.getAttribute("data-media-scene-id");
      if (currentSceneId !== scene.id || vidEl.src !== scene.mediaConfig.url) {
        vidEl.src = scene.mediaConfig.url;
        vidEl.setAttribute("data-media-scene-id", scene.id);
      }
      vidEl.loop = true;
      if (vidEl.paused) {
        vidEl.play().catch(() => {});
      }
    };

    const ensurePictureCached = (scene: StudioScene | undefined) => {
      if (!scene || scene.kind !== "picture_scene" || !scene.mediaConfig) return;
      if (!mediaImageCacheRef.current[scene.id]) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = scene.mediaConfig.url;
        mediaImageCacheRef.current[scene.id] = img;
      }
    };

    syncMediaVideo(previewScene, previewMediaVideoRef.current);
    syncMediaVideo(liveScene, liveMediaVideoRef.current);
    ensurePictureCached(previewScene);
    ensurePictureCached(liveScene);
  }, [previewScene, liveScene]);

  // Enforce Replay Trim Loop (Start -> End) on both Preview and Live replay players
  useEffect(() => {
    const interval = setInterval(() => {
      const checkLoop = (scene: StudioScene | undefined, vidEl: HTMLVideoElement | null) => {
        if (!scene || scene.kind !== "replay_scene" || !scene.replayConfig || !vidEl) return;
        const { startSec, endSec, playbackRate } = scene.replayConfig;
        if (vidEl.playbackRate !== playbackRate) {
          vidEl.playbackRate = playbackRate;
        }
        if (vidEl.currentTime >= endSec || vidEl.ended) {
          vidEl.currentTime = startSec;
          vidEl.play().catch(() => {});
        }
      };
      checkLoop(previewScene, previewReplayVideoRef.current);
      checkLoop(liveScene, liveReplayVideoRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [previewScene, liveScene]);

  // Sync Timeline Scrubber Video Element when user selects a video or scrubs playhead
  useEffect(() => {
    const vidEl = timelineScrubVideoRef.current;
    if (!vidEl || !selectedTimelineVideo) return;
    const currentId = vidEl.getAttribute("data-scrub-id");
    if (currentId !== selectedTimelineVideo.id) {
      const url = URL.createObjectURL(selectedTimelineVideo.blob);
      vidEl.src = url;
      vidEl.setAttribute("data-scrub-id", selectedTimelineVideo.id);
    }
  }, [selectedTimelineVideo]);

  // Helper: Draw a single Camera Slot (Real Webcam, Screen, or Simulated Court Angle) into a target rect
  const drawCameraSlotRect = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      slot: SceneCameraSlot,
      slotIndex: number,
      rx: number,
      ry: number,
      rw: number,
      rh: number,
      nowMs: number
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();

      const roomKey =
        slot.sourceType === "wireless_phone"
          ? (
              slot.wirelessRoomCode || `CAM${slot.id.slice(-4).toUpperCase()}`
            )
              .trim()
              .toUpperCase()
          : "";
      const vidEl =
        (roomKey && wirelessVideoElByRoomRef.current[roomKey]) ||
        videoElBySlotRef.current[slot.id];
      const wirelessImgEl =
        (roomKey && wirelessFrameImgByRoomRef.current[roomKey]) ||
        wirelessFrameImgBySlotRef.current[slot.id];
      const isWirelessSlotEnabled =
        slot.sourceType === "wireless_phone" &&
        activeSlotIds[slot.id] !== false &&
        (Boolean(activeSlotIds[slot.id]) || Boolean(wirelessStatusByRoom[roomKey]));
      const isStreamReady =
        slot.sourceType !== "court_sim" &&
        (slot.sourceType === "wireless_phone"
          ? isWirelessSlotEnabled
          : Boolean(activeSlotIds[slot.id])) &&
        vidEl &&
        vidEl.readyState >= 2;
      const isWirelessImgReady =
        slot.sourceType === "wireless_phone" &&
        isWirelessSlotEnabled &&
        wirelessImgEl &&
        wirelessImgEl.complete &&
        wirelessImgEl.naturalWidth > 0;

      if (isStreamReady && vidEl) {
        // Draw live webcam / capture card / WebRTC wireless phone stream with object-cover scaling
        const vw = vidEl.videoWidth || 1280;
        const vh = vidEl.videoHeight || 720;
        const scale = Math.max(rw / vw, rh / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = rx + (rw - dw) / 2;
        const dy = ry + (rh - dh) / 2;
        ctx.drawImage(vidEl, dx, dy, dw, dh);
      } else if (isWirelessImgReady && wirelessImgEl) {
        // Draw wireless phone relay / IP camera frame with object-cover scaling
        const iw = wirelessImgEl.naturalWidth || 640;
        const ih = wirelessImgEl.naturalHeight || 360;
        const scale = Math.max(rw / iw, rh / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = rx + (rw - dw) / 2;
        const dy = ry + (rh - dh) / 2;
        try {
          ctx.drawImage(wirelessImgEl, dx, dy, dw, dh);
        } catch {
          // ignore
        }
      } else if (slot.sourceType === "wireless_phone") {
        // Waiting for iPhone / Android wireless camera pairing
        ctx.fillStyle = "#090d16";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);

        const roomCode = (
          slot.wirelessRoomCode || `CAM${slot.id.slice(-4).toUpperCase()}`
        ).toUpperCase();
        const platLabel =
          slot.wirelessPlatform === "android"
            ? "🤖 ANDROID WIRELESS CAM"
            : slot.wirelessPlatform === "iphone"
              ? "🍎 IPHONE WIRELESS CAM"
              : "📱 WIRELESS PHONE CAM";
        ctx.fillStyle = "#38bdf8";
        ctx.font = "900 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `${platLabel} • ${slot.angleName || roomCode} (${roomCode})`,
          rx + rw / 2,
          ry + rh / 2 - 20
        );

        ctx.fillStyle = "#94a3b8";
        ctx.font = "700 15px 'Inter', sans-serif";
        ctx.fillText(
          "Click 'Pair QR / Link' in Scene Sources to connect iPhone or Android",
          rx + rw / 2,
          ry + rh / 2 + 16
        );
      } else if (slot.sourceType === "court_sim" || activeSlotIds[slot.id]) {
        // Simulated Dynamic Multi-Cam Court Angle Feed (for testing multi-cam or secondary angles)
        const grad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
        if (slotIndex % 3 === 0) {
          grad.addColorStop(0, "#0f172a");
          grad.addColorStop(1, "#1e3a8a");
        } else if (slotIndex % 3 === 1) {
          grad.addColorStop(0, "#18181b");
          grad.addColorStop(1, "#4c0519");
        } else {
          grad.addColorStop(0, "#090d16");
          grad.addColorStop(1, "#064e3b");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(rx, ry, rw, rh);

        // Hardwood court lines perspective
        ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
        ctx.lineWidth = 3;
        ctx.strokeRect(rx + rw * 0.08, ry + rh * 0.12, rw * 0.84, rh * 0.76);

        // Center court circle
        ctx.beginPath();
        ctx.arc(rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.16, 0, Math.PI * 2);
        ctx.stroke();

        // Animated tracking basketball indicator so recordings/replays have clear visual motion
        const t = nowMs / 650 + slotIndex * 1.7;
        const bx = rx + rw * 0.5 + Math.cos(t) * (rw * 0.26);
        const by = ry + rh * 0.5 + Math.sin(t * 1.4) * (rh * 0.22);

        // Glow
        ctx.fillStyle = "rgba(249, 115, 22, 0.28)";
        ctx.beginPath();
        ctx.arc(bx, by, 32, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(bx, by, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7c2d12";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Center watermark
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = "900 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(slot.angleName || slot.label.toUpperCase(), rx + rw / 2, ry + rh * 0.25);

        ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
        ctx.font = "700 15px 'Inter', sans-serif";
        ctx.fillText(
          `${awayTeamName} ${awayScore} - ${homeScore} ${homeTeamName} • ${formatClock(clockSeconds)}`,
          rx + rw / 2,
          ry + rh * 0.78
        );
      } else {
        // Inactive Camera Slot Placeholder
        ctx.fillStyle = "#090d16";
        ctx.fillRect(rx, ry, rw, rh);

        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);

        ctx.fillStyle = "#475569";
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(slot.label.toUpperCase(), rx + rw / 2, ry + rh / 2 - 14);

        ctx.fillStyle = "#64748b";
        ctx.font = "600 14px 'Inter', sans-serif";
        ctx.fillText(
          "Click 'Activate Cam' in Sources Dock or switch to Court Sim",
          rx + rw / 2,
          ry + rh / 2 + 18
        );
      }

      ctx.restore();
    },
    [
      activeSlotIds,
      wirelessStatusByRoom,
      awayTeamName,
      awayScore,
      homeScore,
      homeTeamName,
      clockSeconds,
    ]
  );

  // Helper: Draw Scorebug Overlay (with Team Logos, Short Name/Initials, Timeout Pips, Penalty Indicator & Clean Shot Clock)
  const drawScorebugOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const isDark = scorebugTheme !== "clean_light";
      const bgPrimary = isDark ? "rgba(11, 27, 48, 0.94)" : "rgba(255, 255, 255, 0.96)";
      const textColor = isDark ? "#ffffff" : "#0f172a";
      const subTextColor = isDark ? "#94a3b8" : "#64748b";
      const borderColor = isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.14)";

      // Helper to render Team Logo or Monogram Crest Badge
      const drawTeamLogoCrest = (
        imgEl: HTMLImageElement | null,
        teamColor: string,
        teamNameStr: string,
        x: number,
        y: number,
        size: number
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = teamColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.stroke();

        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          ctx.clip();
          try {
            ctx.drawImage(imgEl, x, y, size, size);
          } catch {
            // Fallback to monogram if image draw fails
          }
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.font = `900 ${Math.round(size * 0.4)}px 'Inter', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            teamNameStr.slice(0, 3).toUpperCase(),
            x + size / 2,
            y + size / 2 + 1
          );
        }
        ctx.restore();
      };

      // Helper to render Timeout Pips + PENALTY badge
      const drawTimeoutAndPenaltyRow = (
        timeoutsLeft: number,
        inPenalty: boolean,
        x: number,
        y: number,
        align: "left" | "right" = "left"
      ) => {
        ctx.save();
        const maxPips = 5;
        const pipW = 10;
        const pipH = 5;
        const pipGap = 3;
        const totalPipsW = maxPips * pipW + (maxPips - 1) * pipGap;
        const penaltyW = inPenalty ? 52 : 0;
        const totalW = totalPipsW + (inPenalty ? penaltyW + 6 : 0);
        const startX = align === "right" ? x - totalW : x;

        for (let i = 0; i < maxPips; i++) {
          const px = startX + i * (pipW + pipGap);
          ctx.fillStyle =
            i < timeoutsLeft
              ? "#fbbf24"
              : isDark
              ? "rgba(255, 255, 255, 0.18)"
              : "rgba(15, 23, 42, 0.16)";
          ctx.beginPath();
          ctx.roundRect(px, y, pipW, pipH, [2]);
          ctx.fill();
        }

        if (inPenalty) {
          const badgeX = startX + totalPipsW + 6;
          ctx.fillStyle = "#e11d48";
          ctx.beginPath();
          ctx.roundRect(badgeX, y - 4, penaltyW, 13, [4]);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 8.5px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("PENALTY", badgeX + penaltyW / 2, y + 2.5);
        }
        ctx.restore();
      };

      ctx.save();

      if (scorebugPosition === "bottom_bar") {
        const bugW = 920;
        const bugH = 82;
        const bugX = (width - bugW) / 2;
        const bugY = height - bugH - 28;

        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;

        ctx.fillStyle = bgPrimary;
        ctx.beginPath();
        ctx.roundRect(bugX, bugY, bugW, bugH, [16]);
        ctx.fill();

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.shadowColor = "transparent";

        // Away Team Color Accent + Logo + Short Name/Initials + Score + Timeouts/Penalty
        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 10, bugY + 12, 6, bugH - 24, [3]);
        ctx.fill();

        drawTeamLogoCrest(
          awayLogoImgRef.current,
          awayColor,
          awayScorebugName,
          bugX + 24,
          bugY + 17,
          48
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(awayScorebugName.slice(0, 10).toUpperCase(), bugX + 82, bugY + 32);

        drawTimeoutAndPenaltyRow(
          awayTimeoutsRemaining,
          isAwayInPenalty,
          bugX + 82,
          bugY + 55,
          "left"
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 36px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(awayScore), bugX + 312, bugY + bugH / 2);

        // Center Divider
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(bugX + 332, bugY + 12);
        ctx.lineTo(bugX + 332, bugY + bugH - 12);
        ctx.stroke();

        // Home Team Score + Short Name/Initials + Timeouts/Penalty + Logo + Color Accent
        ctx.fillStyle = textColor;
        ctx.font = "900 36px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(String(homeScore), bugX + 352, bugY + bugH / 2);

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.fillText(homeScorebugName.slice(0, 10).toUpperCase(), bugX + 425, bugY + 32);

        drawTimeoutAndPenaltyRow(
          homeTimeoutsRemaining,
          isHomeInPenalty,
          bugX + 425,
          bugY + 55,
          "left"
        );

        drawTeamLogoCrest(
          homeLogoImgRef.current,
          homeColor,
          homeScorebugName,
          bugX + 610,
          bugY + 17,
          48
        );

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 666, bugY + 12, 6, bugH - 24, [3]);
        ctx.fill();

        // Clock & Period Box
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
        ctx.beginPath();
        ctx.roundRect(bugX + 686, bugY + 8, bugW - 694, bugH - 16, [12]);
        ctx.fill();

        ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
        ctx.font = "900 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatClock(clockSeconds), bugX + 755, bugY + 31);

        ctx.fillStyle = subTextColor;
        ctx.font = "800 12px 'Inter', sans-serif";
        ctx.fillText(getPeriodLabel(period).toUpperCase(), bugX + 755, bugY + 55);

        if (showShotClock) {
          ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
          ctx.font = "900 30px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(String(shotClock), bugX + 855, bugY + bugH / 2);
        }
      } else {
        // Compact Corner Bug: Supports BOTH "bottom_left" (Bottom-Left Bug) and "top_corner" (Top-Left Bug)
        const bugW = 470;
        const bugH = 114;
        const bugX = 36;
        const bugY =
          scorebugPosition === "bottom_left" ? height - bugH - 28 : 58;

        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = bgPrimary;
        ctx.beginPath();
        ctx.roundRect(bugX, bugY, bugW, bugH, [16]);
        ctx.fill();

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.shadowColor = "transparent";

        // Away Team Row (Top)
        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 10, bugY + 12, 6, 38, [3]);
        ctx.fill();

        drawTeamLogoCrest(
          awayLogoImgRef.current,
          awayColor,
          awayScorebugName,
          bugX + 22,
          bugY + 13,
          36
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 18px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(awayScorebugName.slice(0, 10).toUpperCase(), bugX + 66, bugY + 23);

        drawTimeoutAndPenaltyRow(
          awayTimeoutsRemaining,
          isAwayInPenalty,
          bugX + 66,
          bugY + 39,
          "left"
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 25px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(awayScore), bugX + 300, bugY + 31);

        // Home Team Row (Bottom)
        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 10, bugY + 62, 6, 38, [3]);
        ctx.fill();

        drawTeamLogoCrest(
          homeLogoImgRef.current,
          homeColor,
          homeScorebugName,
          bugX + 22,
          bugY + 63,
          36
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 18px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(homeScorebugName.slice(0, 10).toUpperCase(), bugX + 66, bugY + 73);

        drawTimeoutAndPenaltyRow(
          homeTimeoutsRemaining,
          isHomeInPenalty,
          bugX + 66,
          bugY + 89,
          "left"
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 25px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(homeScore), bugX + 300, bugY + 81);

        // Right Column: Clock, Quarter & Shot Clock (No 'SC' prefix)
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
        ctx.beginPath();
        ctx.roundRect(bugX + 314, bugY + 10, bugW - 324, bugH - 20, [10]);
        ctx.fill();

        ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatClock(clockSeconds), bugX + 387, bugY + 34);

        ctx.fillStyle = subTextColor;
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.fillText(getPeriodLabel(period).toUpperCase(), bugX + 387, bugY + 57);

        if (showShotClock) {
          ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
          ctx.font = "900 24px 'Inter', sans-serif";
          ctx.fillText(String(shotClock), bugX + 387, bugY + 84);
        }
      }

      if (showSponsorTag) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
        ctx.beginPath();
        ctx.roundRect(width - 250, 24, 215, 36, [10]);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 13px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`🔴 ${sponsorText}`, width - 142, 42);
      }

      ctx.restore();
    },
    [
      scorebugTheme,
      scorebugPosition,
      awayColor,
      awayScorebugName,
      awayScore,
      awayTimeoutsRemaining,
      isAwayInPenalty,
      homeScore,
      homeScorebugName,
      homeColor,
      homeTimeoutsRemaining,
      isHomeInPenalty,
      isClockRunning,
      clockSeconds,
      period,
      showShotClock,
      shotClock,
      showSponsorTag,
      sponsorText,
    ]
  );

  // Helper: Draw Compact On-Court Player Stats Lower-Third Card at Center Bottom (Only Non-Zero Stats)
  const drawLivePlayerStatsOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!featuredOnCourtPlayer) return;

      const totalReb =
        (featuredOnCourtPlayer.oreb || 0) + (featuredOnCourtPlayer.dreb || 0);
      const nonZeroStats: Array<{ label: string; value: string; highlight?: boolean }> = [];

      if (featuredOnCourtPlayer.points > 0) {
        nonZeroStats.push({
          label: "PTS",
          value: String(featuredOnCourtPlayer.points),
          highlight: true,
        });
      }
      if (totalReb > 0) {
        nonZeroStats.push({ label: "REB", value: String(totalReb) });
      }
      if (featuredOnCourtPlayer.ast > 0) {
        nonZeroStats.push({ label: "AST", value: String(featuredOnCourtPlayer.ast) });
      }
      if (featuredOnCourtPlayer.stl > 0) {
        nonZeroStats.push({ label: "STL", value: String(featuredOnCourtPlayer.stl) });
      }
      if (featuredOnCourtPlayer.blk > 0) {
        nonZeroStats.push({ label: "BLK", value: String(featuredOnCourtPlayer.blk) });
      }
      if (featuredOnCourtPlayer.tpm > 0) {
        nonZeroStats.push({
          label: "3PM",
          value: `${featuredOnCourtPlayer.tpm}/${featuredOnCourtPlayer.tpa}`,
        });
      }
      if (featuredOnCourtPlayer.fgm > 0) {
        nonZeroStats.push({
          label: "FG",
          value: `${featuredOnCourtPlayer.fgm}/${featuredOnCourtPlayer.fga}`,
        });
      }
      if (featuredOnCourtPlayer.ftm > 0) {
        nonZeroStats.push({
          label: "FT",
          value: `${featuredOnCourtPlayer.ftm}/${featuredOnCourtPlayer.fta}`,
        });
      }
      if (featuredOnCourtPlayer.pf > 0) {
        nonZeroStats.push({ label: "PF", value: String(featuredOnCourtPlayer.pf) });
      }

      // Compact Lower-Third Dimensions at Center Bottom
      const statBoxW = 68;
      const statGap = 8;
      const statsCount = Math.max(1, nonZeroStats.length);
      const statsAreaW =
        nonZeroStats.length > 0
          ? statsCount * statBoxW + (statsCount - 1) * statGap
          : 165;
      const leftInfoAreaW = 282; // Fixed width for accent + avatar + player name column
      const cardW = leftInfoAreaW + statsAreaW + 22;
      const cardH = 88;
      // Positioned at Center Bottom of the 1920x1080 Live Feed
      const cardX = Math.round((width - cardW) / 2);
      const cardY = height - cardH - 28;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;

      ctx.fillStyle = "rgba(11, 23, 42, 0.95)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, [16]);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = featuredOnCourtPlayer.teamColor || "#38bdf8";
      ctx.stroke();

      ctx.shadowColor = "transparent";

      // Left Team Accent Bar
      ctx.fillStyle = featuredOnCourtPlayer.teamColor || "#38bdf8";
      ctx.beginPath();
      ctx.roundRect(cardX + 10, cardY + 12, 6, cardH - 24, [3]);
      ctx.fill();

      // Player Avatar or Jersey Circle (Compact 58px)
      const avatarSize = 58;
      const avatarX = cardX + 24;
      const avatarY = cardY + Math.round((cardH - avatarSize) / 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = featuredOnCourtPlayer.teamColor || "#1e293b";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.stroke();

      const pImg = featuredPlayerImgRef.current;
      if (pImg && pImg.complete && pImg.naturalWidth > 0) {
        ctx.clip();
        try {
          ctx.drawImage(pImg, avatarX, avatarY, avatarSize, avatarSize);
        } catch {
          // ignore
        }
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 21px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `#${featuredOnCourtPlayer.jerseyNumber}`,
          avatarX + avatarSize / 2,
          avatarY + avatarSize / 2 + 1
        );
      }
      ctx.restore();

      // Player Name, Jersey & Team Badge (Strictly bounded so it never overlaps stat boxes)
      const infoX = avatarX + avatarSize + 14;
      const maxInfoTextW = leftInfoAreaW - (infoX - cardX) - 10;

      ctx.fillStyle = "#38bdf8";
      ctx.font = "900 10.5px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${featuredOnCourtPlayer.teamShortName.toUpperCase()} • #${featuredOnCourtPlayer.jerseyNumber} • ${featuredOnCourtPlayer.position}`,
        infoX,
        cardY + 25,
        maxInfoTextW
      );

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 17px 'Inter', sans-serif";
      const fullName = `${featuredOnCourtPlayer.firstName} ${featuredOnCourtPlayer.lastName}`.trim();
      ctx.fillText(fullName.toUpperCase(), infoX, cardY + 46, maxInfoTextW);

      ctx.fillStyle = "#4ade80";
      ctx.font = "800 9.5px 'Inter', sans-serif";
      ctx.fillText("● ON COURT STATS", infoX, cardY + 66, maxInfoTextW);

      // Vertical Divider between Player Info and Stats
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + leftInfoAreaW - 4, cardY + 14);
      ctx.lineTo(cardX + leftInfoAreaW - 4, cardY + cardH - 14);
      ctx.stroke();

      // Right Side: Non-Zero Stats Boxes
      const statsStartX = cardX + leftInfoAreaW + 6;
      const statsY = cardY + 13;
      const statsH = cardH - 26;

      if (nonZeroStats.length === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
        ctx.beginPath();
        ctx.roundRect(statsStartX, statsY, 165, statsH, [10]);
        ctx.fill();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("ON THE COURT", statsStartX + 82.5, statsY + statsH / 2);
      } else {
        nonZeroStats.forEach((st, idx) => {
          const bx = statsStartX + idx * (statBoxW + statGap);
          ctx.fillStyle = st.highlight
            ? "rgba(225, 29, 72, 0.28)"
            : "rgba(255, 255, 255, 0.08)";
          ctx.beginPath();
          ctx.roundRect(bx, statsY, statBoxW, statsH, [10]);
          ctx.fill();

          ctx.lineWidth = 1.25;
          ctx.strokeStyle = st.highlight
            ? "rgba(251, 113, 133, 0.55)"
            : "rgba(255, 255, 255, 0.14)";
          ctx.stroke();

          ctx.fillStyle = st.highlight ? "#fda4af" : "#94a3b8";
          ctx.font = "900 10px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(st.label, bx + statBoxW / 2, statsY + 18);

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 19px 'Inter', sans-serif";
          ctx.fillText(st.value, bx + statBoxW / 2, statsY + 42, statBoxW - 8);
        });
      }

      ctx.restore();
    },
    [featuredOnCourtPlayer]
  );

  // Render any StudioScene onto a target Canvas (used for both Left Preview & Right Live Program)
  const renderSceneToCanvas = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      scene: StudioScene | undefined,
      replayVidEl: HTMLVideoElement | null,
      mediaVidEl: HTMLVideoElement | null,
      drawOverlay: boolean,
      isLiveProgramCanvas: boolean,
      nowMs: number
    ) => {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, width, height);

      if (!scene) return;

      if (scene.kind === "replay_scene" && scene.replayConfig) {
        // Render Slow-Motion Replay Scene
        if (replayVidEl && replayVidEl.readyState >= 2) {
          ctx.drawImage(replayVidEl, 0, 0, width, height);
        } else {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#f59e0b";
          ctx.font = "900 28px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `LOADING REPLAY CLIP: ${scene.replayConfig.videoTitle}`,
            width / 2,
            height / 2
          );
        }

        // Broadcast Slow-Motion Instant Replay Banner (No Cam indicator behind it)
        ctx.fillStyle = "rgba(225, 29, 72, 0.92)";
        ctx.beginPath();
        ctx.roundRect(36, 24, 380, 44, [10]);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 16px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `⚡ INSTANT REPLAY (${scene.replayConfig.playbackRate}x SLOW-MO) • ${formatClock(
            scene.replayConfig.startSec
          )}-${formatClock(scene.replayConfig.endSec)}`,
          52,
          46
        );
      } else if (scene.kind === "video_scene" && scene.mediaConfig) {
        // Render Uploaded Video Scene
        if (mediaVidEl && mediaVidEl.readyState >= 2) {
          ctx.drawImage(mediaVidEl, 0, 0, width, height);
        } else {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#38bdf8";
          ctx.font = "900 26px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `VIDEO SCENE: ${scene.mediaConfig.fileName}`,
            width / 2,
            height / 2
          );
        }
      } else if (scene.kind === "picture_scene" && scene.mediaConfig) {
        // Render Uploaded Picture / Image Graphic Scene
        const imgEl = mediaImageCacheRef.current[scene.id];
        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          const fit = scene.mediaConfig.objectFit ?? "contain";
          if (fit === "cover") {
            const scale = Math.max(width / imgEl.naturalWidth, height / imgEl.naturalHeight);
            const dw = imgEl.naturalWidth * scale;
            const dh = imgEl.naturalHeight * scale;
            ctx.drawImage(imgEl, (width - dw) / 2, (height - dh) / 2, dw, dh);
          } else {
            const scale = Math.min(width / imgEl.naturalWidth, height / imgEl.naturalHeight);
            const dw = imgEl.naturalWidth * scale;
            const dh = imgEl.naturalHeight * scale;
            ctx.drawImage(imgEl, (width - dw) / 2, (height - dh) / 2, dw, dh);
          }
        } else {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#a855f7";
          ctx.font = "900 26px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `PICTURE SCENE: ${scene.mediaConfig.fileName}`,
            width / 2,
            height / 2
          );
        }
      } else {
        // Render Camera / Multi-Camera Scene
        const cams = scene.cameras;
        if (cams.length === 0) {
          ctx.fillStyle = "#64748b";
          ctx.font = "800 24px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("NO CAMERAS IN THIS SCENE — CLICK '+ ADD CAMERA'", width / 2, height / 2);
        } else if (scene.layout === "single" || cams.length === 1) {
          drawCameraSlotRect(ctx, cams[0], 0, 0, 0, width, height, nowMs);
        } else if (scene.layout === "split_50_50") {
          const halfW = width / 2;
          drawCameraSlotRect(ctx, cams[0], 0, 0, 0, halfW - 2, height, nowMs);
          drawCameraSlotRect(ctx, cams[1] ?? cams[0], 1, halfW + 2, 0, halfW - 2, height, nowMs);
          // Center divider line
          ctx.fillStyle = "#e11d48";
          ctx.fillRect(halfW - 2, 0, 4, height);
        } else if (
          scene.layout === "pip_bottom_right" ||
          scene.layout === "pip_top_right"
        ) {
          // Main camera fullscreen
          drawCameraSlotRect(ctx, cams[0], 0, 0, 0, width, height, nowMs);
          // Secondary PiP camera box
          const pipW = Math.round(width * 0.3);
          const pipH = Math.round(height * 0.3);
          const pipX = width - pipW - 36;
          const pipY =
            scene.layout === "pip_bottom_right" ? height - pipH - 125 : 74;

          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.65)";
          ctx.shadowBlur = 16;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);
          ctx.restore();

          drawCameraSlotRect(
            ctx,
            cams[1] ?? cams[0],
            1,
            pipX,
            pipY,
            pipW,
            pipH,
            nowMs
          );
        } else if (scene.layout === "quad_grid") {
          const halfW = width / 2;
          const halfH = height / 2;
          const quadrants = [
            { x: 0, y: 0 },
            { x: halfW, y: 0 },
            { x: 0, y: halfH },
            { x: halfW, y: halfH },
          ];
          for (let i = 0; i < 4; i++) {
            const cam = cams[i] ?? cams[0];
            drawCameraSlotRect(
              ctx,
              cam,
              i,
              quadrants[i].x,
              quadrants[i].y,
              halfW,
              halfH,
              nowMs
            );
          }
          // Grid crossbars
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(halfW - 1, 0, 2, height);
          ctx.fillRect(0, halfH - 1, width, 2);
        }
      }

      // 1. If the scene is a Picture or Video scene, disable both Scorebug and Player Stats card.
      // 2. If Scorebug is Bottom-Center ("bottom_bar") and Player Stats card is active, hide Scorebug.
      const isPictureOrVideoScene =
        scene.kind === "video_scene" || scene.kind === "picture_scene";
      const hideBottomBarForStatsCard =
        isLiveProgramCanvas &&
        Boolean(featuredOnCourtPlayer) &&
        scorebugPosition === "bottom_bar";

      if (drawOverlay && !isPictureOrVideoScene && !hideBottomBarForStatsCard) {
        drawScorebugOverlay(ctx, width, height);
      }

      // Render Selected On-Court Player Stats at Center Bottom of the Live Feed (disabled on Picture/Video scenes)
      if (
        isLiveProgramCanvas &&
        featuredOnCourtPlayer &&
        !isPictureOrVideoScene
      ) {
        drawLivePlayerStatsOverlay(ctx, width, height);
      }
    },
    [
      drawCameraSlotRect,
      drawScorebugOverlay,
      drawLivePlayerStatsOverlay,
      featuredOnCourtPlayer,
      scorebugPosition,
    ]
  );

  // Helper: Draw Broadcast Logo Stinger Wipe Transition on Live Program Canvas
  const drawLogoStingerOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      progress: number
    ) => {
      // progress goes from 0 -> 1 over ~850ms
      // Smooth ease-in-out
      const ease =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const slant = 220;
      const totalSpan = width + slant * 2 + 400;
      // Sweep from left (-totalSpan/2) across center (0) to right (+totalSpan/2)
      const centerOffset = (ease - 0.5) * totalSpan;

      ctx.save();

      // Secondary Crimson & Gold Leading/Trailing Ribbons
      const drawAngledBand = (
        offsetX: number,
        bandWidth: number,
        color: string
      ) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(offsetX - bandWidth / 2 + slant, 0);
        ctx.lineTo(offsetX + bandWidth / 2 + slant, 0);
        ctx.lineTo(offsetX + bandWidth / 2 - slant, height);
        ctx.lineTo(offsetX - bandWidth / 2 - slant, height);
        ctx.closePath();
        ctx.fill();
      };

      const midX = width / 2 + centerOffset;
      drawAngledBand(midX - 520, 260, "#e11d48");
      drawAngledBand(midX + 520, 260, "#f59e0b");
      drawAngledBand(midX, width + 320, "#0b172a");

      // Subtle inner diagonal accent lines
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(midX - 380 + slant, 0);
      ctx.lineTo(midX - 380 - slant, height);
      ctx.moveTo(midX + 380 + slant, 0);
      ctx.lineTo(midX + 380 - slant, height);
      ctx.stroke();

      // Center Logo Medallion (scales up in the middle of the transition)
      const logoVisibility = Math.max(
        0,
        1 - Math.abs(progress - 0.5) * 2.5
      );
      if (logoVisibility > 0.02) {
        const scale = 0.75 + 0.35 * Math.sin(logoVisibility * Math.PI);
        const logoSize = Math.round(250 * scale);
        const cx = width / 2;
        const cy = height / 2;

        ctx.save();
        ctx.globalAlpha = Math.min(1, logoVisibility * 1.35);

        // Glowing backdrop circle
        ctx.shadowColor = "rgba(225, 29, 72, 0.65)";
        ctx.shadowBlur = 45;
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, logoSize / 2 + 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 5;
        ctx.strokeStyle = "#f59e0b";
        ctx.stroke();
        ctx.shadowColor = "transparent";

        const logoImg = transitionLogoImgRef.current;
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, logoSize / 2 + 8, 0, Math.PI * 2);
          ctx.clip();
          const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
          let dw = logoSize;
          let dh = logoSize;
          if (aspect > 1) {
            dh = logoSize / aspect;
          } else {
            dw = logoSize * aspect;
          }
          ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh);
          ctx.restore();
        } else {
          // Fallback League / Box Score Broadcast Emblem
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 42px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            (activeLeague?.name || "BOX SCORE").slice(0, 12).toUpperCase(),
            cx,
            cy - 8
          );
          ctx.fillStyle = "#f59e0b";
          ctx.font = "800 18px 'Inter', sans-serif";
          ctx.fillText("OFFICIAL BROADCAST", cx, cy + 34);
        }

        ctx.restore();
      }

      ctx.restore();
    },
    [activeLeague?.name]
  );

  // Dual-Monitor Continuous Render Loop (Left = Preview Canvas, Right = Live Program Canvas, + Bottom Scene Preview Strip)
  useEffect(() => {
    let isRunning = true;
    let rafId: number;
    let lastThumbRenderMs = 0;

    const tick = (nowMs: number) => {
      if (!isRunning) return;

      // 1. Render Left PREVIEW Canvas
      const pCanvas = previewCanvasRef.current;
      if (pCanvas) {
        const pCtx = pCanvas.getContext("2d");
        if (pCtx) {
          renderSceneToCanvas(
            pCtx,
            pCanvas.width,
            pCanvas.height,
            previewScene,
            previewReplayVideoRef.current,
            previewMediaVideoRef.current,
            showOverlayInPreview,
            false,
            nowMs
          );
        }
      }

      // 2. Render Right LIVE PROGRAM Canvas
      const lCanvas = liveCanvasRef.current;
      if (lCanvas) {
        const lCtx = lCanvas.getContext("2d");
        if (lCtx) {
          renderSceneToCanvas(
            lCtx,
            lCanvas.width,
            lCanvas.height,
            liveScene,
            liveReplayVideoRef.current,
            liveMediaVideoRef.current,
            true,
            true,
            nowMs
          );

          // Check if Logo Stinger Wipe Transition is active
          const stinger = stingerStateRef.current;
          if (stinger.active) {
            const elapsed = nowMs - stinger.startMs;
            const progress = Math.min(1, Math.max(0, elapsed / stinger.durationMs));
            if (progress >= 0.48 && !stinger.switchedScene) {
              stinger.switchedScene = true;
              setLiveSceneId(stinger.targetSceneId);
            }
            drawLogoStingerOverlay(lCtx, lCanvas.width, lCanvas.height, progress);
            if (progress >= 1) {
              stinger.active = false;
              setIsTransitioning(false);
            }
          }
        }
      }

      // 3. Render Miniature Scene Preview Thumbnails in the Bottom Strip of Left Preview (10fps)
      if (nowMs - lastThumbRenderMs >= 100) {
        lastThumbRenderMs = nowMs;
        for (const sceneItem of scenes) {
          const tCanvas = sceneThumbCanvasByIdRef.current[sceneItem.id];
          if (!tCanvas) continue;
          const tCtx = tCanvas.getContext("2d");
          if (!tCtx) continue;
          tCtx.save();
          tCtx.scale(tCanvas.width / 1920, tCanvas.height / 1080);
          renderSceneToCanvas(
            tCtx,
            1920,
            1080,
            sceneItem,
            sceneItem.id === previewScene?.id
              ? previewReplayVideoRef.current
              : sceneItem.id === liveScene?.id
                ? liveReplayVideoRef.current
                : null,
            sceneItem.id === previewScene?.id
              ? previewMediaVideoRef.current
              : sceneItem.id === liveScene?.id
                ? liveMediaVideoRef.current
                : null,
            false,
            false,
            nowMs
          );
          tCtx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
    };
  }, [
    scenes,
    previewScene,
    liveScene,
    showOverlayInPreview,
    renderSceneToCanvas,
    drawLogoStingerOverlay,
  ]);

  // OBS Transition Actions: CUT, FADE & LOGO WIPE STINGER
  const handleCutToLive = () => {
    setLiveSceneId(previewSceneId);
  };

  const handleLogoTransitionToLive = () => {
    stingerStateRef.current = {
      active: true,
      startMs: performance.now(),
      durationMs: 850,
      switchedScene: false,
      targetSceneId: previewSceneId,
    };
    setIsTransitioning(true);
  };

  const handleFadeToLive = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setLiveSceneId(previewSceneId);
      setIsTransitioning(false);
    }, 280);
  };

  const handleSwapPreviewAndLive = () => {
    const prev = previewSceneId;
    setPreviewSceneId(liveSceneId);
    setLiveSceneId(prev);
  };

  // Scene & Multi-Camera Management Handlers
  const handleAddScene = () => {
    const label =
      newSceneNameInput.trim() || `Scene ${scenes.length + 1}: Custom Camera`;
    const newScene: StudioScene = {
      id: `scene-${generateUUID().slice(0, 8)}`,
      name: label,
      kind: "camera_scene",
      layout: "single",
      cameras: [
        {
          id: `cam-${generateUUID().slice(0, 8)}`,
          label: "Camera 1",
          sourceType: "camera",
          deviceId: videoDevices[0]?.deviceId || "",
          angleName: "CAM 1 • MAIN",
        },
      ],
    };
    setScenes((prev) => [...prev, newScene]);
    setPreviewSceneId(newScene.id);
    setNewSceneNameInput("");
  };

  // Add a Video Scene or Picture Scene from a local media file
  const handleAddMediaScene = (
    e: React.ChangeEvent<HTMLInputElement>,
    mediaType: "video" | "picture"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const prefix = mediaType === "video" ? "🎬 Video" : "🖼️ Picture";
    const label = newSceneNameInput.trim() || `${prefix}: ${cleanName}`;
    const newScene: StudioScene = {
      id: `scene-${mediaType}-${generateUUID().slice(0, 8)}`,
      name: label,
      kind: mediaType === "video" ? "video_scene" : "picture_scene",
      layout: "single",
      cameras: [],
      mediaConfig: {
        mediaType,
        url,
        fileName: file.name,
        loop: true,
        muted: true,
        objectFit: "contain",
      },
    };
    setScenes((prev) => [...prev, newScene]);
    setPreviewSceneId(newScene.id);
    setNewSceneNameInput("");
    e.target.value = "";
  };

  const handleDeleteScene = (sceneId: string) => {
    if (scenes.length <= 1) return;
    const remaining = scenes.filter((s) => s.id !== sceneId);
    setScenes(remaining);
    if (previewSceneId === sceneId) setPreviewSceneId(remaining[0].id);
    if (liveSceneId === sceneId) setLiveSceneId(remaining[0].id);
  };

  const handleAddCameraToPreviewScene = () => {
    if (!previewScene || previewScene.kind !== "camera_scene") return;
    const nextIdx = previewScene.cameras.length + 1;
    const newSlot: SceneCameraSlot = {
      id: `cam-${generateUUID().slice(0, 8)}`,
      label: `Camera ${nextIdx}`,
      sourceType: nextIdx === 1 ? "camera" : "court_sim",
      deviceId: videoDevices[(nextIdx - 1) % Math.max(1, videoDevices.length)]?.deviceId || "",
      angleName: `CAM ${nextIdx} • ANGLE ${nextIdx}`,
    };

    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== previewScene.id) return s;
        const updatedCams = [...s.cameras, newSlot];
        const autoLayout: SceneLayoutMode =
          updatedCams.length === 2 && s.layout === "single"
            ? "split_50_50"
            : updatedCams.length >= 3 && s.layout === "single"
            ? "quad_grid"
            : s.layout;
        return {
          ...s,
          layout: autoLayout,
          cameras: updatedCams,
        };
      })
    );
  };

  // Load Saved Wireless Cameras (iPhone & Android) and Saved Camera Scenes on mount
  const hasLoadedScenesFromStorageRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawSavedCams = window.localStorage.getItem(
        "boxscore_saved_wireless_cameras"
      );
      if (rawSavedCams) {
        const parsedCams = JSON.parse(rawSavedCams) as SavedWirelessCamera[];
        if (Array.isArray(parsedCams)) {
          setSavedWirelessCameras(parsedCams);
          parsedCams.forEach((wc) => {
            if (wc.roomCode) {
              connectWirelessPhoneSlot({
                id: wc.id,
                label: wc.name,
                sourceType: "wireless_phone",
                deviceId: "",
                angleName: wc.name,
                wirelessRoomCode: wc.roomCode,
                wirelessIpUrl: wc.ipUrl || "",
                wirelessPlatform: wc.platform,
                savedWirelessCamId: wc.id,
              });
            }
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const rawScenes = window.localStorage.getItem(
        "boxscore_studio_camera_scenes"
      );
      if (rawScenes) {
        const parsedScenes = JSON.parse(rawScenes) as StudioScene[];
        if (Array.isArray(parsedScenes) && parsedScenes.length > 0) {
          setScenes(parsedScenes);
          parsedScenes.forEach((sc) => {
            sc.cameras?.forEach((slot) => {
              if (slot.sourceType === "wireless_phone") {
                connectWirelessPhoneSlot(slot);
              }
            });
          });
        }
      }
    } catch {
      // ignore
    }
    hasLoadedScenesFromStorageRef.current = true;
  }, [connectWirelessPhoneSlot]);

  // Persist Camera Scenes (including saved wireless cameras assigned across Scenes) to localStorage
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !hasLoadedScenesFromStorageRef.current
    ) {
      return;
    }
    try {
      const cameraScenesOnly = scenes.filter((s) => s.kind === "camera_scene");
      if (cameraScenesOnly.length > 0) {
        window.localStorage.setItem(
          "boxscore_studio_camera_scenes",
          JSON.stringify(cameraScenesOnly)
        );
      }
    } catch {
      // ignore
    }
  }, [scenes]);

  // Save or Update an iPhone / Android Wireless Camera so it can be reused across any Scene
  const handleSaveWirelessCameraFromSlot = (
    slot: SceneCameraSlot,
    customPlatform?: WirelessDevicePlatform
  ) => {
    const roomCode = (
      slot.wirelessRoomCode || `CAM${slot.id.slice(-4).toUpperCase()}`
    )
      .trim()
      .toUpperCase();
    const ipUrl = (slot.wirelessIpUrl || "").trim();
    const platform: WirelessDevicePlatform =
      customPlatform ||
      slot.wirelessPlatform ||
      (slot.angleName.toLowerCase().includes("android") ? "android" : "iphone");
    const name = (
      slot.angleName ||
      slot.label ||
      (platform === "android" ? "Android Wireless Cam" : "iPhone Wireless Cam")
    ).trim();

    let savedEntry: SavedWirelessCamera | null = null;

    setSavedWirelessCameras((prev) => {
      const existingIdx = prev.findIndex(
        (w) =>
          (slot.savedWirelessCamId && w.id === slot.savedWirelessCamId) ||
          w.roomCode.toUpperCase() === roomCode
      );
      let nextList: SavedWirelessCamera[];
      if (existingIdx >= 0) {
        const updated: SavedWirelessCamera = {
          ...prev[existingIdx],
          name,
          platform,
          roomCode,
          ipUrl: ipUrl || undefined,
        };
        savedEntry = updated;
        nextList = prev.map((w, i) => (i === existingIdx ? updated : w));
      } else {
        const created: SavedWirelessCamera = {
          id: `wcam-${generateUUID().slice(0, 8)}`,
          name,
          platform,
          roomCode,
          ipUrl: ipUrl || undefined,
          createdAt: new Date().toISOString(),
        };
        savedEntry = created;
        nextList = [...prev, created];
      }

      try {
        window.localStorage.setItem(
          "boxscore_saved_wireless_cameras",
          JSON.stringify(nextList)
        );
      } catch {
        // ignore
      }
      return nextList;
    });

    const targetSavedId = savedEntry
      ? (savedEntry as SavedWirelessCamera).id
      : slot.savedWirelessCamId;

    setScenes((prev) =>
      prev.map((sc) => ({
        ...sc,
        cameras: sc.cameras.map((c) => {
          const isSameSlotOrRoom =
            c.id === slot.id ||
            (c.sourceType === "wireless_phone" &&
              (c.wirelessRoomCode || "").trim().toUpperCase() === roomCode);
          if (!isSameSlotOrRoom) return c;
          return {
            ...c,
            angleName: name,
            wirelessRoomCode: roomCode,
            wirelessIpUrl: ipUrl,
            wirelessPlatform: platform,
            savedWirelessCamId: targetSavedId,
          };
        }),
      }))
    );

    connectWirelessPhoneSlot({
      ...slot,
      angleName: name,
      wirelessRoomCode: roomCode,
      wirelessIpUrl: ipUrl,
      wirelessPlatform: platform,
      savedWirelessCamId: targetSavedId,
    });

    setWirelessCamNotice(
      `✓ Saved ${platform === "android" ? "🤖 Android" : "🍎 iPhone"} camera "${name}" (${roomCode})! You can now add or select it in any Scene.`
    );
    setTimeout(() => setWirelessCamNotice(null), 5000);
  };

  // Delete a Saved Wireless Camera from the reusable library
  const handleDeleteSavedWirelessCamera = (savedCamId: string) => {
    setSavedWirelessCameras((prev) => {
      const nextList = prev.filter((w) => w.id !== savedCamId);
      try {
        window.localStorage.setItem(
          "boxscore_saved_wireless_cameras",
          JSON.stringify(nextList)
        );
      } catch {
        // ignore
      }
      return nextList;
    });
  };

  // Use a Saved iPhone / Android Wireless Camera in any target Scene (either assigning to a specific slot or adding to the Scene)
  const handleUseSavedWirelessCameraInScene = (
    savedCam: SavedWirelessCamera,
    targetSceneId: string,
    targetSlotId?: string
  ) => {
    const roomCode = savedCam.roomCode.trim().toUpperCase();
    const targetSceneObj = scenes.find((s) => s.id === targetSceneId);
    if (!targetSceneObj || targetSceneObj.kind !== "camera_scene") return;

    // 1. If a specific camera slot ID was provided, assign the saved wireless camera to that slot
    if (targetSlotId) {
      const updatedSlot: SceneCameraSlot = {
        id: targetSlotId,
        label: savedCam.name,
        sourceType: "wireless_phone",
        deviceId: "",
        angleName: savedCam.name,
        wirelessRoomCode: roomCode,
        wirelessIpUrl: savedCam.ipUrl || "",
        wirelessPlatform: savedCam.platform,
        savedWirelessCamId: savedCam.id,
      };
      setScenes((prev) =>
        prev.map((sc) => {
          if (sc.id !== targetSceneId) return sc;
          return {
            ...sc,
            cameras: sc.cameras.map((c) =>
              c.id === targetSlotId ? updatedSlot : c
            ),
          };
        })
      );
      connectWirelessPhoneSlot(updatedSlot);
      setWirelessCamNotice(
        `📱 Assigned saved ${savedCam.platform === "android" ? "🤖 Android" : "🍎 iPhone"} camera "${savedCam.name}" (${roomCode}) to "${targetSceneObj.name}"!`
      );
      setTimeout(() => setWirelessCamNotice(null), 4000);
      return;
    }

    // 2. Check if this saved wireless camera is already present in targetScene
    const existingSlot = targetSceneObj.cameras.find(
      (c) =>
        c.sourceType === "wireless_phone" &&
        ((c.wirelessRoomCode || "").trim().toUpperCase() === roomCode ||
          c.savedWirelessCamId === savedCam.id)
    );
    if (existingSlot) {
      connectWirelessPhoneSlot({
        ...existingSlot,
        angleName: savedCam.name,
        wirelessRoomCode: roomCode,
        wirelessIpUrl: savedCam.ipUrl || "",
        wirelessPlatform: savedCam.platform,
        savedWirelessCamId: savedCam.id,
      });
      setWirelessCamNotice(
        `📱 "${savedCam.name}" (${roomCode}) is active in "${targetSceneObj.name}"!`
      );
      setTimeout(() => setWirelessCamNotice(null), 4000);
      return;
    }

    // 3. If the scene has a single unactivated default placeholder slot, replace it; otherwise append as a new camera slot
    const firstSlot = targetSceneObj.cameras[0];
    const shouldReplaceSingleInactivePlaceholder =
      targetSceneObj.cameras.length === 1 &&
      firstSlot &&
      firstSlot.sourceType === "camera" &&
      !activeSlotIds[firstSlot.id];

    const newSlotId = shouldReplaceSingleInactivePlaceholder
      ? firstSlot.id
      : `cam-${generateUUID().slice(0, 8)}`;

    const newWirelessSlot: SceneCameraSlot = {
      id: newSlotId,
      label: savedCam.name,
      sourceType: "wireless_phone",
      deviceId: "",
      angleName: savedCam.name,
      wirelessRoomCode: roomCode,
      wirelessIpUrl: savedCam.ipUrl || "",
      wirelessPlatform: savedCam.platform,
      savedWirelessCamId: savedCam.id,
    };

    setScenes((prev) =>
      prev.map((sc) => {
        if (sc.id !== targetSceneId) return sc;
        const updatedCams = shouldReplaceSingleInactivePlaceholder
          ? [newWirelessSlot]
          : [...sc.cameras, newWirelessSlot];
        const autoLayout: SceneLayoutMode =
          updatedCams.length === 2 && sc.layout === "single"
            ? "split_50_50"
            : updatedCams.length >= 3 && sc.layout === "single"
              ? "quad_grid"
              : sc.layout;
        return {
          ...sc,
          layout: autoLayout,
          cameras: updatedCams,
        };
      })
    );

    connectWirelessPhoneSlot(newWirelessSlot);
    setWirelessCamNotice(
      `📱 Added saved ${savedCam.platform === "android" ? "🤖 Android" : "🍎 iPhone"} camera "${savedCam.name}" (${roomCode}) to "${targetSceneObj.name}"!`
    );
    setTimeout(() => setWirelessCamNotice(null), 4000);
  };

  // Add an iPhone / Android Wireless Camera Slot to the Preview Scene and open the QR Pairing Modal
  const handleAddWirelessPhoneCameraToPreviewScene = (
    platform: WirelessDevicePlatform = "iphone"
  ) => {
    if (!previewScene || previewScene.kind !== "camera_scene") return;
    const nextIdx = previewScene.cameras.length + 1;
    const slotId = `cam-${generateUUID().slice(0, 8)}`;
    const roomCode = `CAM${Math.floor(100 + Math.random() * 900)}`;
    const defaultLabel =
      platform === "android"
        ? `Android Cam ${nextIdx}`
        : `iPhone Cam ${nextIdx}`;
    const newSlot: SceneCameraSlot = {
      id: slotId,
      label: defaultLabel,
      sourceType: "wireless_phone",
      deviceId: "",
      angleName: defaultLabel.toUpperCase(),
      wirelessRoomCode: roomCode,
      wirelessIpUrl: "",
      wirelessPlatform: platform,
    };

    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== previewScene.id) return s;
        const updatedCams = [...s.cameras, newSlot];
        const autoLayout: SceneLayoutMode =
          updatedCams.length === 2 && s.layout === "single"
            ? "split_50_50"
            : updatedCams.length >= 3 && s.layout === "single"
            ? "quad_grid"
            : s.layout;
        return {
          ...s,
          layout: autoLayout,
          cameras: updatedCams,
        };
      })
    );

    connectWirelessPhoneSlot(newSlot);
    setPairingWirelessSlot({ sceneId: previewScene.id, slotId });
  };

  const handleUpdateCameraSlot = (
    sceneId: string,
    slotId: string,
    patch: Partial<SceneCameraSlot>
  ) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== sceneId) return s;
        return {
          ...s,
          cameras: s.cameras.map((c) => (c.id === slotId ? { ...c, ...patch } : c)),
        };
      })
    );
  };

  const handleRemoveCameraSlot = (sceneId: string, slotId: string) => {
    stopCameraSlot(slotId);
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== sceneId) return s;
        return {
          ...s,
          cameras: s.cameras.filter((c) => c.id !== slotId),
        };
      })
    );
  };

  const handleSetSceneLayout = (sceneId: string, layout: SceneLayoutMode) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, layout } : s))
    );
  };

  // Capture a small thumbnail + exact Game Clock & Score from Live Canvas for the Bottom Camera Timeline
  const captureLiveTimelineThumbnail = (sec: number): TimelineFrame | null => {
    const lCanvas = liveCanvasRef.current;
    if (!lCanvas) return null;
    try {
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 160;
      thumbCanvas.height = 90;
      const tCtx = thumbCanvas.getContext("2d");
      if (!tCtx) return null;
      tCtx.drawImage(lCanvas, 0, 0, 160, 90);
      const clk = liveClockStateRef.current;
      const pLabel = getPeriodLabel(clk.period);
      return {
        timeSec: sec,
        dataUrl: thumbCanvas.toDataURL("image/jpeg", 0.6),
        gameClockLabel: `${pLabel} ${formatClock(clk.clockSeconds)}`,
        period: clk.period,
        gameClockSeconds: clk.clockSeconds,
        homeScore: clk.homeScore,
        awayScore: clk.awayScore,
      };
    } catch {
      return null;
    }
  };

  // Start Live Recording (Records the RIGHT LIVE PROGRAM Canvas + Builds Bottom Camera Timeline!)
  const startRecording = () => {
    const lCanvas = liveCanvasRef.current;
    if (!lCanvas) return;

    try {
      const canvasStream = lCanvas.captureStream(30);
      // Attach Web Audio API Master Mixer tracks (Microphones + BGM/SFX audio files)
      if (masterAudioDestRef.current) {
        masterAudioDestRef.current.stream.getAudioTracks().forEach((track) => {
          try {
            canvasStream.addTrack(track);
          } catch {}
        });
      }
      // Attach any direct camera/microphone audio tracks as fallback
      Object.values(streamBySlotRef.current).forEach((st) => {
        st.getAudioTracks().forEach((track) => {
          try {
            canvasStream.addTrack(track);
          } catch {}
        });
      });

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 4_500_000,
      });

      recordedChunksRef.current = [];
      liveCaptureFramesRef.current = [];
      setLiveRecordingFrames([]);
      recordStartTimeRef.current = Date.now();

      // Create initial Game Clock Tag at 0s so operator has a starting clock anchor
      const initClk = liveClockStateRef.current;
      const startTag: TimelineClockTag = {
        id: `tag-${generateUUID().slice(0, 6)}`,
        recTimeSec: 0,
        gameClockLabel: `${getPeriodLabel(initClk.period)} ${formatClock(initClk.clockSeconds)}`,
        scoreLabel: `${initClk.awayScore}-${initClk.homeScore}`,
        label: "Rec Start",
      };
      liveClockTagsRef.current = [startTag];
      setLiveClockTags([startTag]);

      // Take initial frame at 0s
      const firstFrame = captureLiveTimelineThumbnail(0);
      if (firstFrame) {
        liveCaptureFramesRef.current = [firstFrame];
        setLiveRecordingFrames([firstFrame]);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const elapsedSec = Math.max(
          2,
          Math.round((Date.now() - recordStartTimeRef.current) / 1000)
        );
        const videoId = generateUUID();
        const frames = [...liveCaptureFramesRef.current];
        const tags = [...liveClockTagsRef.current];

        const newVideo: StoredGameVideo = {
          id: videoId,
          matchId: activeMatch?.id ?? "generic-game",
          gameNumber: activeMatch?.gameNumber ?? 1,
          title: `Game #${activeMatch?.gameNumber || 1} (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
          blob: finalBlob,
          mimeType,
          sizeBytes: finalBlob.size,
          durationSeconds: elapsedSec,
          createdAt: new Date().toISOString(),
          thumbnailDataUrl: frames[0]?.dataUrl || "",
          timelineFrames: frames,
          clockTags: tags,
          homeScore,
          awayScore,
          homeTeamName,
          awayTeamName,
        };

        // Always persist in IndexedDB so the Bottom Camera Timeline & Replay Scene Selector can use it immediately
        await saveVideoToIndexedDB(newVideo);

        if (storageLocation === "local_filesystem" && "showSaveFilePicker" in window) {
          try {
            const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
              suggestedName: `Game_${activeMatch?.gameNumber || 1}_${Date.now()}.webm`,
              types: [
                {
                  description: "WebM Broadcast Video",
                  accept: { "video/webm": [".webm"] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(finalBlob);
            await writable.close();
          } catch {
            // User cancelled file dialog; clip is still safely in IndexedDB timeline
          }
        } else if (storageLocation === "download_prompt") {
          const url = URL.createObjectURL(finalBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Game_${activeMatch?.gameNumber || 1}_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        }

        const updatedList = await getAllStoredVideos();
        setStoredVideos(updatedList);
        setSelectedTimelineVideoId(newVideo.id);
        // Default to a 10-second Replay Selection Box at the end of the recording!
        const boxDur = Math.min(elapsedSec, replayBoxDurationPreset || 10);
        const defaultStart = Math.max(0, elapsedSec - boxDur);
        setTrimStartSec(defaultStart);
        setTrimEndSec(elapsedSec);
        setTimelinePlayheadSec(defaultStart);
        setIsRecording(false);
        setRecordSeconds(0);
        setTimelineNotice(
          `✓ Saved ${elapsedSec}s recording with Game Clock tags! Drag the 10s Replay Box or Playhead below to create a Replay Scene.`
        );
        setTimeout(() => setTimelineNotice(null), 6000);
      };

      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          const snap = captureLiveTimelineThumbnail(next);
          if (snap) {
            liveCaptureFramesRef.current = [...liveCaptureFramesRef.current, snap];
            setLiveRecordingFrames([...liveCaptureFramesRef.current]);
          }
          // Keep timeline & Replay Box steady on screen; operator can click "Jump to Latest Time" anytime
          return next;
        });
      }, 1000);
    } catch {
      alert("Unable to start recording on this browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  // =====================================================================
  // FACEBOOK PAGE & YOUTUBE LIVE DIRECT RTMPS STREAMING ENGINE
  // =====================================================================
  const handleSelectStreamPlatform = (platform: StreamPlatform) => {
    setStreamPlatform(platform);
    if (platform === "facebook") {
      setRtmpServerUrl("rtmps://live-api-s.facebook.com:443/rtmp/");
    } else if (platform === "youtube") {
      setRtmpServerUrl("rtmp://a.rtmp.youtube.com/live2");
    }
  };

  const stopRtmpLiveStream = useCallback(async () => {
    if (encoderLoopRef.current) {
      clearInterval(encoderLoopRef.current);
      encoderLoopRef.current = null;
    }
    if (flushLoopRef.current) {
      clearInterval(flushLoopRef.current);
      flushLoopRef.current = null;
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    try {
      if (videoEncoderRef.current && videoEncoderRef.current.state !== "closed") {
        videoEncoderRef.current.close();
      }
    } catch {}
    videoEncoderRef.current = null;
    pendingRtmpFramesRef.current = [];
    isFlushingRtmpRef.current = false;
    setIsStreamingLive(false);
    setIsConnectingStream(false);

    try {
      await fetch("/api/rtmp-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          sessionId: rtmpSessionIdRef.current,
        }),
      });
    } catch {}
  }, []);

  const startRtmpLiveStream = async () => {
    setStreamError(null);

    if (!streamKey.trim()) {
      setStreamError(
        "Paste your Facebook Stream Key (e.g. FB-177029...) from Facebook Live Producer first."
      );
      setShowFbSetupModal(true);
      return;
    }

    const win = window as unknown as {
      VideoEncoder?: new (init: {
        output: (
          chunk: {
            type: "key" | "delta";
            timestamp: number;
            byteLength: number;
            copyTo: (dest: Uint8Array) => void;
          },
          meta?: { decoderConfig?: { description?: ArrayBuffer } }
        ) => void;
        error: (e: Error) => void;
      }) => {
        configure: (cfg: Record<string, unknown>) => void;
        encode: (frame: unknown, opts?: { keyFrame?: boolean }) => void;
        close: () => void;
        state: string;
      };
      VideoFrame?: new (
        source: HTMLCanvasElement,
        init: { timestamp: number }
      ) => { close: () => void };
    };

    if (!win.VideoEncoder || !win.VideoFrame) {
      setStreamError(
        "Your browser requires WebCodecs (Google Chrome / Edge) for direct RTMPS streaming, or use the Pop-Out Clean Program Window."
      );
      return;
    }

    setIsConnectingStream(true);
    const sessionId = `rtmp-${generateUUID().slice(0, 8)}`;
    rtmpSessionIdRef.current = sessionId;
    pendingRtmpFramesRef.current = [];
    avcConfigBase64Ref.current = undefined;
    streamFrameCountRef.current = 0;
    streamStartTimeRef.current = performance.now();

    try {
      // 1. Prepare 1280x720 30fps Broadcast Encoder Canvas
      if (!encoderCanvasRef.current) {
        const c = document.createElement("canvas");
        c.width = 1280;
        c.height = 720;
        encoderCanvasRef.current = c;
      }

      // 2. Configure Hardware H.264 Baseline Encoder (avc format for direct RTMP FLV muxing)
      const encoder = new win.VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description) {
            const descBytes = new Uint8Array(meta.decoderConfig.description);
            if (descBytes.length > 0) {
              avcConfigBase64Ref.current = uint8ArrayToBase64(descBytes);
            }
          }
          const buf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(buf);
          pendingRtmpFramesRef.current.push({
            timestampMs: Math.max(0, Math.round(chunk.timestamp / 1000)),
            isKeyframe: chunk.type === "key",
            dataBase64: uint8ArrayToBase64(buf),
          });
          // Cap queue if network stalls
          if (pendingRtmpFramesRef.current.length > 90) {
            pendingRtmpFramesRef.current = pendingRtmpFramesRef.current.slice(-45);
          }
        },
        error: (err) => {
          setStreamError(`Encoder error: ${err.message}`);
        },
      });

      encoder.configure({
        codec: "avc1.42001f",
        width: 1280,
        height: 720,
        bitrate: 2_500_000,
        framerate: 30,
        avc: { format: "avc" },
      });
      videoEncoderRef.current = encoder;

      // Encode initial keyframe immediately so avcC sequence header is ready
      if (liveCanvasRef.current && encoderCanvasRef.current) {
        const eCtx = encoderCanvasRef.current.getContext("2d");
        if (eCtx) {
          eCtx.drawImage(liveCanvasRef.current, 0, 0, 1280, 720);
          const firstVf = new win.VideoFrame(encoderCanvasRef.current, { timestamp: 0 });
          encoder.encode(firstVf, { keyFrame: true });
          firstVf.close();
          streamFrameCountRef.current = 1;
        }
      }

      // 3. Connect to Facebook Live / YouTube Live RTMPS Server
      const startRes = await fetch("/api/rtmp-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          sessionId,
          rtmpUrl: rtmpServerUrl,
          streamKey: streamKey.trim(),
          avcConfigBase64: avcConfigBase64Ref.current,
        }),
      });

      const startJson = (await startRes.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!startRes.ok || !startJson.ok) {
        throw new Error(
          startJson.error ||
            "Could not connect to Facebook Live RTMPS server. Verify your Stream Key."
        );
      }

      setIsConnectingStream(false);
      setIsStreamingLive(true);
      setStreamDurationSec(0);
      setStreamFramesSent(0);
      setStreamBytesSent(0);

      // 4. Start 30fps Frame Encoding Loop from Right Live Program Canvas
      encoderLoopRef.current = setInterval(() => {
        const lCanvas = liveCanvasRef.current;
        const eCanvas = encoderCanvasRef.current;
        const enc = videoEncoderRef.current;
        if (!lCanvas || !eCanvas || !enc || enc.state !== "configured") return;

        const eCtx = eCanvas.getContext("2d");
        if (!eCtx) return;
        eCtx.drawImage(lCanvas, 0, 0, 1280, 720);

        const elapsedUs = Math.round(
          (performance.now() - streamStartTimeRef.current) * 1000
        );
        const isKey = streamFrameCountRef.current % 60 === 0; // Keyframe every 2s for Facebook Live
        streamFrameCountRef.current += 1;

        try {
          const vf = new win.VideoFrame!(eCanvas, { timestamp: elapsedUs });
          enc.encode(vf, { keyFrame: isKey });
          vf.close();
        } catch {}
      }, 33);

      // 5. Start Sequential RTMPS Packet Flush Loop (every 350ms, concurrency = 1)
      flushLoopRef.current = setInterval(async () => {
        if (isFlushingRtmpRef.current || pendingRtmpFramesRef.current.length === 0) {
          return;
        }
        isFlushingRtmpRef.current = true;
        const batch = pendingRtmpFramesRef.current.splice(0, 25);

        try {
          const pushRes = await fetch("/api/rtmp-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "push",
              sessionId: rtmpSessionIdRef.current,
              rtmpUrl: rtmpServerUrl,
              streamKey: streamKey.trim(),
              avcConfigBase64: avcConfigBase64Ref.current,
              frames: batch,
            }),
          });
          const pushJson = (await pushRes.json()) as {
            ok: boolean;
            bytesSent?: number;
            framesSent?: number;
            error?: string;
          };
          if (pushJson.ok) {
            setStreamFramesSent((prev) => prev + (pushJson.framesSent || batch.length));
            setStreamBytesSent((prev) => prev + (pushJson.bytesSent || 0));
          } else if (pushJson.error) {
            setStreamError(pushJson.error);
          }
        } catch {
          // Network blip; next batch will auto-reconnect
        } finally {
          isFlushingRtmpRef.current = false;
        }
      }, 350);

      // 6. Elapsed Stream Uptime Counter
      streamTimerRef.current = setInterval(() => {
        setStreamDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      await stopRtmpLiveStream();
      setStreamError(
        err instanceof Error
          ? err.message
          : "Failed to start Facebook Live stream."
      );
    }
  };

  // Pop-Out Clean 16:9 Program Window (Alternative zero-latency capture for Facebook Screen Share / OBS)
  const openCleanProgramWindow = () => {
    const lCanvas = liveCanvasRef.current;
    if (!lCanvas) return;
    const popup = window.open(
      "",
      "BoxScoreCleanProgramOut",
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no"
    );
    if (!popup) {
      alert("Please allow pop-ups to open the Clean 16:9 Live Program Window.");
      return;
    }
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BOX SCORE - Clean Live Program Feed (Share this window in Facebook Live)</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #000; width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            video { width: 100%; height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <video id="cleanProgVideo" autoplay muted playsinline></video>
        </body>
      </html>
    `);
    popup.document.close();
    const vid = popup.document.getElementById("cleanProgVideo") as HTMLVideoElement | null;
    if (vid) {
      vid.srcObject = lCanvas.captureStream(30);
      vid.play().catch(() => {});
    }
  };

  const activeTimelineDuration = Math.max(
    10,
    isRecording ? Math.max(15, recordSeconds + 2) : selectedTimelineVideo?.durationSeconds || 20
  );
  const displayTimelineFrames = useMemo(
    () => (isRecording ? liveRecordingFrames : selectedTimelineVideo?.timelineFrames || []),
    [isRecording, liveRecordingFrames, selectedTimelineVideo]
  );
  const displayClockTags = useMemo(
    () => (isRecording ? liveClockTags : selectedTimelineVideo?.clockTags || []),
    [isRecording, liveClockTags, selectedTimelineVideo]
  );

  // Get exact Game Clock Tag (e.g. "Q2 08:42") at any recording second on the timeline
  const getGameClockLabelAtSec = useCallback(
    (sec: number): string => {
      const rounded = Math.max(0, Math.round(sec));
      if (displayTimelineFrames.length > 0) {
        let best = displayTimelineFrames[0];
        let bestDiff = Math.abs(best.timeSec - rounded);
        for (const f of displayTimelineFrames) {
          const diff = Math.abs(f.timeSec - rounded);
          if (diff < bestDiff) {
            best = f;
            bestDiff = diff;
          }
        }
        if (best?.gameClockLabel) {
          return best.gameClockLabel;
        }
      }
      const fallbackClock = Math.max(0, clockSeconds - rounded);
      return `${getPeriodLabel(period)} ${formatClock(fallbackClock)}`;
    },
    [displayTimelineFrames, clockSeconds, period]
  );

  // Create a Replay Scene from the selected Timeline In/Out range (works both on saved clips AND during live recording!)
  const handleCreateReplaySceneFromTimeline = async (pushImmediatelyToLive = false) => {
    let targetVideo = selectedTimelineVideo;

    // If currently recording and no saved video is selected (or user wants replay from live recording), snapshot recordedChunksRef
    if (isRecording && recordedChunksRef.current.length > 0) {
      const snapBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const elapsedSec = Math.max(2, recordSeconds);
      const snapId = generateUUID();
      const snapVideo: StoredGameVideo = {
        id: snapId,
        matchId: activeMatch?.id ?? "generic-game",
        gameNumber: activeMatch?.gameNumber ?? 1,
        title: `Live Buffer Clip (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
        blob: snapBlob,
        mimeType: "video/webm",
        sizeBytes: snapBlob.size,
        durationSeconds: elapsedSec,
        createdAt: new Date().toISOString(),
        thumbnailDataUrl: liveCaptureFramesRef.current[0]?.dataUrl || "",
        timelineFrames: [...liveCaptureFramesRef.current],
        clockTags: [...liveClockTagsRef.current],
        homeScore,
        awayScore,
        homeTeamName,
        awayTeamName,
      };
      await saveVideoToIndexedDB(snapVideo);
      const list = await getAllStoredVideos();
      setStoredVideos(list);
      targetVideo = snapVideo;
    }

    if (!targetVideo) {
      alert("Record a game clip first so you can select a replay segment on the timeline.");
      return;
    }

    const maxClipDur = Math.max(2, targetVideo.durationSeconds || activeTimelineDuration);
    const start = Math.max(0, Math.min(trimStartSec, trimEndSec - 0.5));
    const end = Math.max(start + 1, Math.min(trimEndSec, maxClipDur));
    const startGameClock = getGameClockLabelAtSec(start);
    const endGameClock = getGameClockLabelAtSec(end);

    const customTitle =
      replayClipLabel.trim() ||
      `Replay [${startGameClock}] (${formatClock(start)}-${formatClock(end)} @ ${selectedReplaySpeed}x)`;

    const newReplayScene: StudioScene = {
      id: `scene-replay-${generateUUID().slice(0, 6)}`,
      name: `🎬 ${customTitle}`,
      kind: "replay_scene",
      layout: "single",
      cameras: [],
      replayConfig: {
        videoId: targetVideo.id,
        videoTitle: targetVideo.title,
        startSec: start,
        endSec: end,
        playbackRate: selectedReplaySpeed,
      },
    };

    setScenes((prev) => [...prev, newReplayScene]);
    setPreviewSceneId(newReplayScene.id);
    if (pushImmediatelyToLive) {
      setLiveSceneId(newReplayScene.id);
    }
    setReplayClipLabel("");
    setTimelineNotice(
      pushImmediatelyToLive
        ? `⚡ Replay Scene "${customTitle}" (${startGameClock} → ${endGameClock}) created and pushed LIVE!`
        : `✓ Replay Scene "${customTitle}" (${startGameClock} → ${endGameClock}) added to Scenes & cued on Left Preview!`
    );
    setTimeout(() => setTimelineNotice(null), 5000);
  };

  const handleScrubTimeline = useCallback(
    (sec: number) => {
      const maxDur = isRecording
        ? Math.max(10, recordSeconds)
        : selectedTimelineVideo?.durationSeconds || 20;
      const clamped = Math.max(0, Math.min(maxDur, Number(sec.toFixed(1))));
      setTimelinePlayheadSec(clamped);
      if (timelineScrubVideoRef.current) {
        try {
          timelineScrubVideoRef.current.currentTime = clamped;
        } catch {}
      }
    },
    [isRecording, recordSeconds, selectedTimelineVideo]
  );

  // Scroll horizontal timeline container so target second is visible & centered
  const scrollTimelineToSec = useCallback(
    (sec: number) => {
      const container = timelineScrollContainerRef.current;
      if (!container) return;
      const targetPx = sec * timelineZoomPxPerSec;
      const halfView = container.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetPx - halfView),
        behavior: "smooth",
      });
    },
    [timelineZoomPxPerSec]
  );

  // Jump Replay Box, Playhead & Timeline Scrollbar to the Latest Recorded Time
  const handleJumpToLatestTime = useCallback(() => {
    const latestSec = isRecording
      ? Math.max(1, recordSeconds)
      : selectedTimelineVideo?.durationSeconds || activeTimelineDuration;
    const boxDur = replayBoxDurationPreset || 10;
    const start = Math.max(0, Number((latestSec - boxDur).toFixed(1)));
    const end = Number(latestSec.toFixed(1));
    setTrimStartSec(start);
    setTrimEndSec(end);
    handleScrubTimeline(end);
    scrollTimelineToSec(end);
    setTimelineNotice(
      `⏭ Jumped Replay Box & Playhead to Latest Time (${formatClock(end)} • ${getGameClockLabelAtSec(end)})`
    );
    setTimeout(() => setTimelineNotice(null), 3500);
  }, [
    isRecording,
    recordSeconds,
    selectedTimelineVideo,
    activeTimelineDuration,
    replayBoxDurationPreset,
    handleScrubTimeline,
    scrollTimelineToSec,
    getGameClockLabelAtSec,
  ]);

  // Snap the Replay Selection Box around or ending at target second
  const handleSnapBoxToSecond = useCallback(
    (targetSec: number, boxDuration = replayBoxDurationPreset) => {
      const maxDur = activeTimelineDuration;
      const clampedTarget = Math.max(0, Math.min(maxDur, targetSec));
      const half = boxDuration / 2;
      let start = Math.max(0, clampedTarget - half);
      let end = start + boxDuration;
      if (end > maxDur) {
        end = maxDur;
        start = Math.max(0, end - boxDuration);
      }
      setTrimStartSec(Number(start.toFixed(1)));
      setTrimEndSec(Number(end.toFixed(1)));
      handleScrubTimeline(clampedTarget);
      scrollTimelineToSec(clampedTarget);
    },
    [activeTimelineDuration, replayBoxDurationPreset, handleScrubTimeline, scrollTimelineToSec]
  );

  // =====================================================================
  // REPLAY INSPECTOR ENGINE (RUN SLOW-MO REPLAY BEFORE PUTTING IT LIVE!)
  // =====================================================================
  const ensureInspectorVideoSource = useCallback(() => {
    const vidEl = timelineScrubVideoRef.current;
    if (!vidEl) return false;

    // If currently recording and chunks exist, load live buffer blob into Inspector
    if (isRecording && recordedChunksRef.current.length > 0) {
      const liveBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(liveBlob);
      vidEl.src = url;
      vidEl.setAttribute("data-scrub-id", `live-${recordSeconds}`);
      return true;
    }

    if (selectedTimelineVideo) {
      const currentId = vidEl.getAttribute("data-scrub-id");
      if (currentId !== selectedTimelineVideo.id) {
        const url = URL.createObjectURL(selectedTimelineVideo.blob);
        vidEl.src = url;
        vidEl.setAttribute("data-scrub-id", selectedTimelineVideo.id);
      }
      return true;
    }
    return false;
  }, [isRecording, recordSeconds, selectedTimelineVideo]);

  const handleToggleInspectorReplay = () => {
    const vidEl = timelineScrubVideoRef.current;
    if (!vidEl) return;

    if (isPlayingInspectorReplay) {
      vidEl.pause();
      setIsPlayingInspectorReplay(false);
      return;
    }

    const hasSource = ensureInspectorVideoSource();
    if (!hasSource) {
      alert("Start recording or select a saved recording first to run a replay in the Replay Inspector.");
      return;
    }

    vidEl.playbackRate = selectedReplaySpeed;
    if (vidEl.currentTime < trimStartSec || vidEl.currentTime >= trimEndSec) {
      vidEl.currentTime = trimStartSec;
    }
    setTimelinePlayheadSec(trimStartSec);
    setIsPlayingInspectorReplay(true);
    vidEl.play().catch(() => {
      setIsPlayingInspectorReplay(false);
    });
  };

  const handleRestartInspectorReplay = () => {
    const vidEl = timelineScrubVideoRef.current;
    if (!vidEl) return;
    if (!ensureInspectorVideoSource()) return;
    vidEl.playbackRate = selectedReplaySpeed;
    vidEl.currentTime = trimStartSec;
    setTimelinePlayheadSec(trimStartSec);
    setIsPlayingInspectorReplay(true);
    vidEl.play().catch(() => {});
  };

  // Loop Replay Inspector between trimStartSec and trimEndSec & advance Playhead
  useEffect(() => {
    if (!isPlayingInspectorReplay) return;
    const interval = setInterval(() => {
      const vidEl = timelineScrubVideoRef.current;
      if (!vidEl) return;
      if (vidEl.playbackRate !== selectedReplaySpeed) {
        vidEl.playbackRate = selectedReplaySpeed;
      }
      if (vidEl.currentTime >= trimEndSec || vidEl.ended) {
        vidEl.currentTime = trimStartSec;
        vidEl.play().catch(() => {});
      }
      setTimelinePlayheadSec(Number(vidEl.currentTime.toFixed(1)));
    }, 80);
    return () => clearInterval(interval);
  }, [isPlayingInspectorReplay, trimStartSec, trimEndSec, selectedReplaySpeed]);

  // Resolve any Play-by-Play Event to its exact Recording Second on the Camera Timeline
  const resolvePlayEventTimelineSec = useCallback(
    (playId: string, periodLabel: string, gameClockDisplay: string, createdAtIso?: string): number => {
      // 1. Direct live map hit
      if (playEventRecSecMapRef.current[playId] !== undefined) {
        return playEventRecSecMapRef.current[playId];
      }
      // 2. Match against displayClockTags
      const matchingTag = displayClockTags.find(
        (t) =>
          t.id === `pbp-${playId}` ||
          t.gameClockLabel.toLowerCase() === `${periodLabel} ${gameClockDisplay}`.toLowerCase()
      );
      if (matchingTag) return matchingTag.recTimeSec;

      // 3. Match against captured TimelineFrame gameClockLabel
      const targetClockFull = `${periodLabel} ${gameClockDisplay}`.toLowerCase();
      const matchingFrame = displayTimelineFrames.find(
        (f) =>
          (f.gameClockLabel || "").toLowerCase() === targetClockFull ||
          (f.gameClockLabel || "").endsWith(gameClockDisplay)
      );
      if (matchingFrame) return matchingFrame.timeSec;

      // 4. Match by timestamp offset relative to selectedTimelineVideo.createdAt
      if (createdAtIso && selectedTimelineVideo?.createdAt) {
        const videoEndMs = new Date(selectedTimelineVideo.createdAt).getTime();
        const videoStartMs = videoEndMs - (selectedTimelineVideo.durationSeconds || 20) * 1000;
        const playMs = new Date(createdAtIso).getTime();
        if (playMs >= videoStartMs && playMs <= videoEndMs) {
          return Math.max(0, Math.round((playMs - videoStartMs) / 1000));
        }
      }

      return Math.min(activeTimelineDuration, Math.max(0, timelinePlayheadSec));
    },
    [displayClockTags, displayTimelineFrames, selectedTimelineVideo, activeTimelineDuration, timelinePlayheadSec]
  );

  // Click any Play-by-Play item -> Jump to Timeline where captured, snap Replay Box & cue Replay Inspector!
  const handleJumpToPlayByPlayOnTimeline = (
    recSec: number,
    clockLabel: string,
    playDesc: string
  ) => {
    const boxDur = replayBoxDurationPreset || 10;
    const maxDur = activeTimelineDuration;
    // Lead-in 70% before the play, 30% after the play so the whole basketball action is inside the box
    let start = Math.max(0, Number((recSec - boxDur * 0.7).toFixed(1)));
    let end = Number((start + boxDur).toFixed(1));
    if (end > maxDur) {
      end = maxDur;
      start = Math.max(0, Number((end - boxDur).toFixed(1)));
    }
    setTrimStartSec(start);
    setTrimEndSec(end);
    handleScrubTimeline(recSec);
    scrollTimelineToSec(recSec);
    setReplayClipLabel(`${clockLabel} • ${playDesc}`.slice(0, 42));
    setTimelineNotice(
      `🏀 Jumped to Play "${playDesc}" at ${clockLabel} (Rec ${formatClock(recSec)})! Click "▶ Run Replay" in the Replay Inspector to preview.`
    );
    setTimeout(() => setTimelineNotice(null), 5000);
  };

  // Change Replay Selection Box Size Preset (e.g. 5s, 10s, 15s, 20s)
  const handleSetReplayBoxPreset = (durationSec: number) => {
    setReplayBoxDurationPreset(durationSec);
    const maxDur = activeTimelineDuration;
    let start = trimStartSec;
    let end = start + durationSec;
    if (end > maxDur) {
      end = maxDur;
      start = Math.max(0, end - durationSec);
    }
    setTrimStartSec(Number(start.toFixed(1)));
    setTrimEndSec(Number(end.toFixed(1)));
  };

  // Tag a Play with the Game Clock on the Timeline (works both live during recording and on saved recordings)
  const handleAddClockTag = async (presetLabel?: string) => {
    const labelText = (presetLabel || customTagInput.trim() || "Key Play").trim();
    const recSec = isRecording ? recordSeconds : Math.round(timelinePlayheadSec);
    const gClock = isRecording
      ? `${getPeriodLabel(period)} ${formatClock(clockSeconds)}`
      : getGameClockLabelAtSec(recSec);
    const sLabel = `${awayScore}-${homeScore}`;

    const newTag: TimelineClockTag = {
      id: `tag-${generateUUID().slice(0, 6)}`,
      recTimeSec: recSec,
      gameClockLabel: gClock,
      scoreLabel: sLabel,
      label: labelText,
    };

    if (isRecording) {
      const nextTags = [...liveClockTagsRef.current, newTag];
      liveClockTagsRef.current = nextTags;
      setLiveClockTags(nextTags);
      setCustomTagInput("");
      setTimelineNotice(`🏷️ Tagged "${labelText}" at Game Clock ${gClock} (Rec ${formatClock(recSec)})`);
      setTimeout(() => setTimelineNotice(null), 4000);
      return;
    }

    if (selectedTimelineVideo) {
      const updatedVideo: StoredGameVideo = {
        ...selectedTimelineVideo,
        clockTags: [...(selectedTimelineVideo.clockTags || []), newTag],
      };
      await saveVideoToIndexedDB(updatedVideo);
      const list = await getAllStoredVideos();
      setStoredVideos(list);
      setCustomTagInput("");
      setTimelineNotice(`🏷️ Tagged "${labelText}" at Game Clock ${gClock} (Rec ${formatClock(recSec)})`);
      setTimeout(() => setTimelineNotice(null), 4000);
    }
  };

  const handleRemoveClockTag = async (tagId: string) => {
    if (isRecording) {
      const nextTags = liveClockTagsRef.current.filter((t) => t.id !== tagId);
      liveClockTagsRef.current = nextTags;
      setLiveClockTags(nextTags);
      return;
    }
    if (selectedTimelineVideo) {
      const updatedVideo: StoredGameVideo = {
        ...selectedTimelineVideo,
        clockTags: (selectedTimelineVideo.clockTags || []).filter((t) => t.id !== tagId),
      };
      await saveVideoToIndexedDB(updatedVideo);
      const list = await getAllStoredVideos();
      setStoredVideos(list);
    }
  };

  // Convert pointer clientX to exact timeline second using uncompressed pixel-per-second track
  const clientXToTimelineSec = useCallback(
    (clientX: number): number => {
      const trackEl = timelineTrackInnerRef.current;
      if (!trackEl) return 0;
      const rect = trackEl.getBoundingClientRect();
      const relX = clientX - rect.left;
      const sec = relX / timelineZoomPxPerSec;
      return Math.max(0, Math.min(activeTimelineDuration, Number(sec.toFixed(1))));
    },
    [timelineZoomPxPerSec, activeTimelineDuration]
  );

  // Pointer-capture drag handlers for Playhead and 10s Replay Selection Box
  const startTimelineDrag = (
    e: React.PointerEvent<HTMLElement>,
    mode: "playhead" | "box_move" | "box_left" | "box_right"
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pointerSec = clientXToTimelineSec(e.clientX);
    if (mode === "box_move") {
      dragOffsetSecRef.current = pointerSec - trimStartSec;
      dragBoxWidthSecRef.current = Math.max(1, trimEndSec - trimStartSec);
    } else if (mode === "playhead") {
      handleScrubTimeline(pointerSec);
    }
    setActiveDragMode(mode);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveTimelineDrag = (
    e: React.PointerEvent<HTMLElement>,
    mode: "playhead" | "box_move" | "box_left" | "box_right"
  ) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    const pointerSec = clientXToTimelineSec(e.clientX);
    const maxDur = activeTimelineDuration;

    if (mode === "playhead") {
      handleScrubTimeline(pointerSec);
    } else if (mode === "box_move") {
      const boxW = dragBoxWidthSecRef.current;
      const rawStart = pointerSec - dragOffsetSecRef.current;
      const clampedStart = Math.max(0, Math.min(maxDur - boxW, Number(rawStart.toFixed(1))));
      const clampedEnd = Number(Math.min(maxDur, clampedStart + boxW).toFixed(1));
      setTrimStartSec(clampedStart);
      setTrimEndSec(clampedEnd);
      handleScrubTimeline(clampedStart);
    } else if (mode === "box_left") {
      const clampedStart = Math.max(0, Math.min(trimEndSec - 1, pointerSec));
      setTrimStartSec(clampedStart);
      handleScrubTimeline(clampedStart);
    } else if (mode === "box_right") {
      const clampedEnd = Math.max(trimStartSec + 1, Math.min(maxDur, pointerSec));
      setTrimEndSec(clampedEnd);
      handleScrubTimeline(clampedEnd);
    }
  };

  const endTimelineDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    setActiveDragMode(null);
  };

  // Search / Filter Game Clock Tags & Frames on the Timeline
  const clockSearchMatches = useMemo(() => {
    const q = clockSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{
      id: string;
      recTimeSec: number;
      gameClockLabel: string;
      title: string;
      kind: "tag" | "frame";
    }> = [];

    for (const t of displayClockTags) {
      if (
        t.gameClockLabel.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        formatClock(t.recTimeSec).includes(q)
      ) {
        results.push({
          id: t.id,
          recTimeSec: t.recTimeSec,
          gameClockLabel: t.gameClockLabel,
          title: `🏷️ ${t.label} (${t.scoreLabel})`,
          kind: "tag",
        });
      }
    }

    for (const f of displayTimelineFrames) {
      const gLabel = f.gameClockLabel || getGameClockLabelAtSec(f.timeSec);
      if (gLabel.toLowerCase().includes(q) || formatClock(f.timeSec).includes(q)) {
        if (!results.some((r) => Math.abs(r.recTimeSec - f.timeSec) < 1)) {
          results.push({
            id: `frame-${f.timeSec}`,
            recTimeSec: f.timeSec,
            gameClockLabel: gLabel,
            title: `📹 Frame @ Rec ${formatClock(f.timeSec)}`,
            kind: "frame",
          });
        }
      }
    }
    return results.slice(0, 12);
  }, [clockSearchQuery, displayClockTags, displayTimelineFrames, getGameClockLabelAtSec]);

  // Active Playhead Frame Preview
  const activePlayheadFrame = useMemo(() => {
    if (displayTimelineFrames.length === 0) return null;
    const target = Math.round(timelinePlayheadSec);
    let best = displayTimelineFrames[0];
    let bestDiff = Math.abs(best.timeSec - target);
    for (const f of displayTimelineFrames) {
      const diff = Math.abs(f.timeSec - target);
      if (diff < bestDiff) {
        best = f;
        bestDiff = diff;
      }
    }
    return best;
  }, [displayTimelineFrames, timelinePlayheadSec]);

  const handleDeleteStoredVideo = async (videoId: string) => {
    await deleteStoredVideo(videoId);
    const list = await getAllStoredVideos();
    setStoredVideos(list);
    if (selectedTimelineVideoId === videoId) {
      setSelectedTimelineVideoId(list[0]?.id || "");
    }
  };

  const handleDownloadVideo = (video: StoredGameVideo) => {
    const url = URL.createObjectURL(video.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${video.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Uncompressed pixel width of the timeline track based on Zoom level (px/sec)
  const totalTimelineWidthPx = Math.max(
    760,
    Math.ceil(activeTimelineDuration * timelineZoomPxPerSec)
  );

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans select-none">
      {/* Hidden Replay & Media Video Elements for Preview & Live Program */}
      <video ref={previewReplayVideoRef} playsInline muted className="hidden" />
      <video ref={liveReplayVideoRef} playsInline muted className="hidden" />
      <video ref={previewMediaVideoRef} playsInline muted loop className="hidden" />
      <video ref={liveMediaVideoRef} playsInline muted loop className="hidden" />

      {/* =====================================================================
          1. TOP OBS STUDIO BAR
         ===================================================================== */}
      <header className="border-b border-slate-800 bg-[#111622] px-4 py-2 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-rose-500" />
            <span>Back to App</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            <h1 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-rose-500" />
              Box Score OBS Studio Mode
            </h1>
          </div>
        </div>

        {/* Center: Active League & Game Matchup Selector + Real-time Score */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select League"
            value={selectedLeagueId}
            onChange={(e) => setSelectedLeagueId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                🏆 {l.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Select Match"
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            {matches.map((m) => {
              const h =
                teams.find((t) => t.id === m.homeTeamId)?.name ||
                m.homeTeamPlaceholder ||
                "Home";
              const a =
                teams.find((t) => t.id === m.awayTeamId)?.name ||
                m.awayTeamPlaceholder ||
                "Away";
              return (
                <option key={m.id} value={m.id}>
                  Game #{m.gameNumber}: {h} vs {a}
                </option>
              );
            })}
          </select>

          {/* Live Synced Game Clock & Score Pill */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1 text-xs font-black">
            <span style={{ color: awayColor }}>{awayTeamName.slice(0, 3).toUpperCase()}</span>
            <span className="text-white text-sm">{awayScore}</span>
            <span className="text-slate-500">-</span>
            <span className="text-white text-sm">{homeScore}</span>
            <span style={{ color: homeColor }}>{homeTeamName.slice(0, 3).toUpperCase()}</span>
            <span className="ml-1 rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 text-[0.65rem] font-black text-amber-300">
              {getPeriodLabel(period)} • {formatClock(clockSeconds)}
            </span>
          </div>
        </div>

        {/* Right: Facebook Live Stream & Quick Record Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Facebook / YouTube Live Button */}
          {!isStreamingLive ? (
            <button
              type="button"
              onClick={() => setShowFbSetupModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-sm cursor-pointer"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Go Live on Facebook / YouTube</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500 px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[0.68rem] font-black uppercase text-emerald-300">
                ON AIR • {streamPlatform.toUpperCase()} ({formatClock(streamDurationSec)})
              </span>
              <button
                type="button"
                onClick={stopRtmpLiveStream}
                className="ml-1 rounded bg-rose-600 hover:bg-rose-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white cursor-pointer"
              >
                End Stream
              </button>
            </div>
          )}

          {/* Clean 16:9 Program Window Pop-Out */}
          <button
            type="button"
            onClick={openCleanProgramWindow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-200 cursor-pointer"
            title="Pop out a clean 16:9 Live Program window (for Facebook Live Screen Share or external OBS)"
          >
            <Tv className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden sm:inline">Clean Feed Pop-Out</span>
          </button>

          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-sm cursor-pointer"
            >
              <Circle className="h-3 w-3 fill-current" />
              Start Live Record
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm cursor-pointer animate-pulse"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop &amp; Save ({formatClock(recordSeconds)})
            </button>
          )}
        </div>
      </header>

      {/* =====================================================================
          2. UPPER OBS STUDIO MODE: DUAL MONITORS (PREVIEW ON LEFT | TRANSITION | LIVE ON RIGHT)
         ===================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-11 gap-3 p-3 sm:p-4 bg-[#0d111a] border-b border-slate-800">
        {/* LEFT MONITOR: PREVIEW (CUE / EDIT) */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-emerald-500/40 bg-[#131926] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-950/50 border-b border-emerald-500/30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-slate-950">
                PREVIEW (LEFT)
              </span>
              <span className="text-xs font-black uppercase text-emerald-200 truncate">
                {previewScene?.name}
              </span>
            </div>
            <label className="flex items-center gap-1.5 text-[0.65rem] font-bold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showOverlayInPreview}
                onChange={(e) => setShowOverlayInPreview(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              Show Scorebug
            </label>
          </div>

          <div className="relative aspect-video w-full bg-black flex items-center justify-center">
            <canvas
              ref={previewCanvasRef}
              width={1920}
              height={1080}
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[0.62rem] font-bold text-emerald-300 border border-emerald-500/30 pointer-events-none">
              {previewScene?.kind === "replay_scene"
                ? `🎬 Replay Scene (${previewScene.replayConfig?.playbackRate}x Slow-Mo)`
                : previewScene?.kind === "video_scene"
                ? `🎬 Video Scene: ${previewScene.mediaConfig?.fileName}`
                : previewScene?.kind === "picture_scene"
                ? `🖼️ Picture Scene: ${previewScene.mediaConfig?.fileName}`
                : `🎥 ${previewScene?.cameras.length || 0} Camera(s) • Layout: ${previewScene?.layout.toUpperCase()}`}
            </div>
          </div>

          {/* PREVIEW BOTTOM BAR: HORIZONTALLY SCROLLABLE SCENES PREVIEW STRIP */}
          <div className="px-3 py-2 bg-[#0e1420] border-t border-emerald-500/30 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-emerald-300 flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>Scenes Preview ({scenes.length})</span>
                </span>
                <span className="text-[0.6rem] font-bold text-slate-400">
                  Scroll horizontally &amp; click a scene to load into Preview
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddScene}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-emerald-300 cursor-pointer"
                  title="Add New Camera Scene"
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>+ Cam Scene</span>
                </button>
                <label
                  className="inline-flex items-center gap-1 rounded-md bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-sky-300 cursor-pointer"
                  title="Add Video Scene"
                >
                  <Film className="h-2.5 w-2.5" />
                  <span>+ Video</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleAddMediaScene(e, "video")}
                    className="hidden"
                  />
                </label>
                <label
                  className="inline-flex items-center gap-1 rounded-md bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-purple-300 cursor-pointer"
                  title="Add Picture Scene"
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>+ Picture</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleAddMediaScene(e, "picture")}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Horizontally Scrollable Scene Thumbnail Cards */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 snap-x snap-mandatory">
              {scenes.map((sceneItem) => {
                const isPreview = sceneItem.id === previewSceneId;
                const isLive = sceneItem.id === liveSceneId;
                return (
                  <button
                    key={sceneItem.id}
                    type="button"
                    onClick={() => setPreviewSceneId(sceneItem.id)}
                    className={`group relative shrink-0 snap-start w-[132px] sm:w-[148px] rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                      isPreview
                        ? "border-emerald-400 ring-2 ring-emerald-500/40 bg-emerald-950/50 shadow-md"
                        : isLive
                          ? "border-rose-500/70 bg-slate-900/90 hover:border-emerald-400"
                          : "border-slate-800 bg-slate-900/80 hover:border-slate-600"
                    }`}
                    title={`Click to preview: ${sceneItem.name}`}
                  >
                    {/* Live Miniature 16:9 Scene Preview Canvas */}
                    <div className="relative aspect-video w-full bg-black overflow-hidden">
                      <canvas
                        ref={(el) => {
                          sceneThumbCanvasByIdRef.current[sceneItem.id] = el;
                        }}
                        width={320}
                        height={180}
                        className="w-full h-full object-contain"
                      />

                      {/* Status Badges (PRV / LIVE) */}
                      <div className="absolute top-1 left-1 right-1 flex items-center justify-between gap-1 pointer-events-none">
                        <div className="flex items-center gap-1">
                          {isPreview && (
                            <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[0.5rem] font-black uppercase text-slate-950 shadow">
                              PRV
                            </span>
                          )}
                          {isLive && (
                            <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[0.5rem] font-black uppercase text-white shadow">
                              LIVE
                            </span>
                          )}
                        </div>
                        <span className="rounded bg-black/75 px-1 py-0.5 text-[0.48rem] font-bold uppercase text-slate-300">
                          {sceneItem.kind === "replay_scene"
                            ? "Replay"
                            : sceneItem.kind === "video_scene"
                              ? "Video"
                              : sceneItem.kind === "picture_scene"
                                ? "Pic"
                                : `${sceneItem.cameras.length} Cam`}
                        </span>
                      </div>
                    </div>

                    {/* Scene Name & Subtitle */}
                    <div className="px-2 py-1.5 bg-slate-950/90 border-t border-slate-800/80">
                      <div className="text-[0.62rem] font-black text-white truncate group-hover:text-emerald-300 transition-colors">
                        {sceneItem.name}
                      </div>
                      <div className="text-[0.52rem] font-bold text-slate-400 truncate">
                        {sceneItem.kind === "replay_scene"
                          ? `⚡ ${sceneItem.replayConfig?.playbackRate}x Slow-Mo`
                          : sceneItem.kind === "video_scene"
                            ? `🎬 ${sceneItem.mediaConfig?.fileName || "Video"}`
                            : sceneItem.kind === "picture_scene"
                              ? `🖼️ ${sceneItem.mediaConfig?.fileName || "Picture"}`
                              : `🎥 ${sceneItem.layout.replace(/_/g, " ")}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: OBS STUDIO MODE TRANSITION BAR (WITH LOGO WIPE & UPLOAD) */}
        <div className="lg:col-span-1 flex flex-wrap lg:flex-col items-center justify-center gap-2 p-2 rounded-xl border border-slate-800 bg-[#131926]">
          <span className="hidden lg:block text-[0.62rem] font-black uppercase tracking-widest text-slate-400 text-center">
            Transition
          </span>

          <button
            type="button"
            onClick={handleCutToLive}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 px-2.5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5"
            title="Instant Cut from Left Preview to Right Live Output"
          >
            <span className="flex items-center gap-1">
              <span>CUT</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.55rem] font-bold text-rose-200">Instant</span>
          </button>

          {/* LOGO STINGER WIPE TRANSITION */}
          <button
            type="button"
            onClick={handleLogoTransitionToLive}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 border border-sky-400/40 px-2.5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5"
            title="Broadcast Logo Wipe Transition using your League or Uploaded Logo"
          >
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>LOGO</span>
            </span>
            <span className="text-[0.55rem] font-bold text-sky-100">Logo Wipe</span>
          </button>

          {/* UPLOAD TRANSITION LOGO (E.G. LEAGUE LOGO) */}
          <div className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 flex flex-col items-center gap-1">
            {effectiveTransitionLogoUrl ? (
              <img
                src={effectiveTransitionLogoUrl}
                alt="Transition Logo"
                className="h-7 w-7 rounded-full object-cover border border-amber-400/60"
              />
            ) : (
              <span className="text-[0.52rem] font-bold text-slate-400 text-center">
                No Logo
              </span>
            )}
            <label
              className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 py-1 px-1.5 text-[0.55rem] font-black uppercase text-amber-300 text-center cursor-pointer flex items-center justify-center gap-1"
              title="Upload League Logo or Custom Stinger Logo for Transitions"
            >
              <Upload className="h-2.5 w-2.5 shrink-0" />
              <span>Logo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadTransitionLogo}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleFadeToLive}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5"
            title="Smooth 300ms Fade from Preview to Live"
          >
            <span className="flex items-center gap-1">
              <span>FADE</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.55rem] font-bold text-slate-800">300ms</span>
          </button>

          <button
            type="button"
            onClick={handleSwapPreviewAndLive}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-slate-200 cursor-pointer flex items-center justify-center gap-1"
            title="Swap Preview and Live Scenes"
          >
            <ArrowLeftRight className="h-3 w-3 text-sky-400" />
            <span>Swap</span>
          </button>
        </div>

        {/* RIGHT MONITOR: PROGRAM / LIVE ON AIR */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-rose-500/50 bg-[#131926] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 bg-rose-950/60 border-b border-rose-500/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded bg-rose-600 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                PROGRAM / LIVE (RIGHT)
              </span>
              <span className="text-xs font-black uppercase text-rose-200 truncate">
                {liveScene?.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isRecording && (
                <span className="rounded bg-rose-600 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white animate-pulse">
                  ● REC {formatClock(recordSeconds)}
                </span>
              )}
              <span className="text-[0.62rem] font-bold text-slate-400">1080p 30fps</span>
            </div>
          </div>

          <div
            className={`relative aspect-video w-full bg-black flex items-center justify-center transition-opacity duration-200 ${
              isTransitioning ? "opacity-50" : "opacity-100"
            }`}
          >
            <canvas
              ref={liveCanvasRef}
              width={1920}
              height={1080}
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-2 left-2 rounded bg-rose-950/85 px-2 py-0.5 text-[0.62rem] font-bold text-rose-200 border border-rose-500/40 pointer-events-none">
              {liveScene?.kind === "replay_scene"
                ? `⚡ ON AIR: SLOW-MO REPLAY (${liveScene.replayConfig?.playbackRate}x)`
                : `🔴 ON AIR: ${liveScene?.name}`}
            </div>
          </div>

          {/* LIVE CONTROL: ON-COURT PLAYER STATS OVERLAY (SHOWS NON-ZERO STATS IN MIDDLE OF LIVE FEED) */}
          <div className="px-3 py-2 bg-[#0e1420] border-t border-rose-500/30 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-rose-600/20 border border-rose-500/40 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-rose-300">
                  🏀 Live On-Court Player Stats Overlay
                </span>
                <span className="text-[0.6rem] font-bold text-slate-400">
                  Click an on-court player to show non-zero stats in middle of Live Feed
                </span>
              </div>
              {featuredOnCourtPlayer && (
                <button
                  type="button"
                  onClick={() => setLiveFeaturedPlayerId("")}
                  className="rounded-md bg-rose-600 hover:bg-rose-500 px-2 py-0.5 text-[0.6rem] font-black uppercase text-white cursor-pointer"
                >
                  ✕ Hide Stats Card
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {/* Away On-Court Players */}
              <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-900/90 border border-slate-800 px-2 py-1">
                <span
                  className="text-[0.58rem] font-black uppercase shrink-0 mr-1"
                  style={{ color: awayColor }}
                >
                  {awayScorebugName}:
                </span>
                {onCourtAwayPlayers.map((p) => {
                  const isSelected = liveFeaturedPlayerId === p.playerId;
                  return (
                    <button
                      key={p.playerId}
                      type="button"
                      onClick={() =>
                        setLiveFeaturedPlayerId(isSelected ? "" : p.playerId)
                      }
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[0.62rem] font-black transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-rose-600 border-rose-400 text-white shadow"
                          : "bg-slate-800/90 border-slate-700 text-slate-200 hover:border-sky-400"
                      }`}
                      title={`Show #${p.jerseyNumber} ${p.firstName} ${p.lastName} stats in middle of Live Feed`}
                    >
                      #{p.jerseyNumber} {p.lastName || p.firstName}
                    </button>
                  );
                })}
              </div>

              {/* Home On-Court Players */}
              <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-900/90 border border-slate-800 px-2 py-1">
                <span
                  className="text-[0.58rem] font-black uppercase shrink-0 mr-1"
                  style={{ color: homeColor }}
                >
                  {homeScorebugName}:
                </span>
                {onCourtHomePlayers.map((p) => {
                  const isSelected = liveFeaturedPlayerId === p.playerId;
                  return (
                    <button
                      key={p.playerId}
                      type="button"
                      onClick={() =>
                        setLiveFeaturedPlayerId(isSelected ? "" : p.playerId)
                      }
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[0.62rem] font-black transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-rose-600 border-rose-400 text-white shadow"
                          : "bg-slate-800/90 border-slate-700 text-slate-200 hover:border-sky-400"
                      }`}
                      title={`Show #${p.jerseyNumber} ${p.firstName} ${p.lastName} stats in middle of Live Feed`}
                    >
                      #{p.jerseyNumber} {p.lastName || p.firstName}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. BOTTOM LIVE RECORD & CAMERA TIMELINE DOCK (STEADY REPLAY BOX, JUMP TO LATEST, REPLAY INSPECTOR & PLAY-BY-PLAY)
         ===================================================================== */}
      <section className="p-3 sm:p-4 bg-[#101520] border-b border-slate-800 space-y-3">
        {/* TOP TIMELINE HEADER: TITLE, JUMP TO LATEST TIME, SAVED RECORD PICKER & ZOOM CONTROLS */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Film className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Camera Timeline • Replay Inspector &amp; Live Play-by-Play
            </h2>
            {isRecording && (
              <span className="rounded-md bg-rose-600/20 border border-rose-500/40 px-2 py-0.5 text-[0.65rem] font-black text-rose-300 animate-pulse">
                ● Live Recording ({recordSeconds}s • {getPeriodLabel(period)} {formatClock(clockSeconds)})
              </span>
            )}
            <button
              type="button"
              onClick={handleJumpToLatestTime}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider text-slate-950 shadow cursor-pointer transition-colors"
              title="Jump Playhead, Replay Box, and Timeline Scrollbar to the latest recorded timestamp"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span>Jump to Latest Time</span>
            </button>
          </div>

          {/* Right: Saved Recording Picker + Zoom In/Out Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1">
              <span className="text-[0.62rem] font-black uppercase text-slate-400">
                Track Zoom:
              </span>
              <button
                type="button"
                onClick={() =>
                  setTimelineZoomPxPerSec((z) => Math.max(24, z - 16))
                }
                className="rounded bg-slate-800 hover:bg-slate-700 p-1 text-slate-200 cursor-pointer"
                title="Zoom Out Timeline Track"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                aria-label="Timeline Track Zoom"
                min={24}
                max={160}
                step={8}
                value={timelineZoomPxPerSec}
                onChange={(e) => setTimelineZoomPxPerSec(Number(e.target.value))}
                className="w-24 accent-sky-400 cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  setTimelineZoomPxPerSec((z) => Math.min(160, z + 16))
                }
                className="rounded bg-slate-800 hover:bg-slate-700 p-1 text-slate-200 cursor-pointer"
                title="Zoom In Timeline Track"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <span className="text-[0.62rem] font-mono font-bold text-sky-400 min-w-[46px] text-right">
                {timelineZoomPxPerSec}px/s
              </span>
              <button
                type="button"
                onClick={() => scrollTimelineToSec(timelinePlayheadSec)}
                className="ml-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5 text-[0.6rem] font-black uppercase text-rose-300 border border-rose-500/30 cursor-pointer"
                title="Scroll timeline to center the Playhead"
              >
                Center Playhead
              </button>
            </div>

            <select
              aria-label="Select Saved Recording on Timeline"
              value={selectedTimelineVideoId}
              onChange={(e) => {
                const vid = storedVideos.find((v) => v.id === e.target.value);
                setSelectedTimelineVideoId(e.target.value);
                if (vid) {
                  const boxDur = Math.min(vid.durationSeconds || 10, replayBoxDurationPreset || 10);
                  const start = Math.max(0, (vid.durationSeconds || 10) - boxDur);
                  setTrimStartSec(start);
                  setTrimEndSec(vid.durationSeconds || 10);
                  setTimelinePlayheadSec(start);
                }
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              {storedVideos.length === 0 ? (
                <option value="">-- No Saved Record Yet (Click Start Live Record) --</option>
              ) : (
                storedVideos.map((v) => (
                  <option key={v.id} value={v.id}>
                    📹 {v.title} ({v.durationSeconds}s)
                  </option>
                ))
              )}
            </select>

            {selectedTimelineVideo && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownloadVideo(selectedTimelineVideo)}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[0.68rem] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                  title="Download this recorded game file"
                >
                  <Download className="h-3 w-3 text-sky-400" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteStoredVideo(selectedTimelineVideo.id)}
                  className="rounded-lg border border-rose-900/60 bg-rose-950/40 hover:bg-rose-900/60 px-2 py-1 text-[0.68rem] font-bold text-rose-300 cursor-pointer"
                  title="Delete recording"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* GAME CLOCK TAG & SEARCH BAR (FIND ANY PLAY BY GAME CLOCK OR STAMP NEW PLAY TAGS!) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0d121c] px-3 py-2">
          {/* Left: Search by Game Clock */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <div className="relative flex items-center flex-1 max-w-xs">
              <Search className="h-3.5 w-3.5 text-amber-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={clockSearchQuery}
                onChange={(e) => setClockSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clockSearchMatches.length > 0) {
                    handleSnapBoxToSecond(clockSearchMatches[0].recTimeSec);
                  }
                }}
                placeholder="Search Game Clock (e.g. 08:42, Q2, 3PT)..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-2.5 py-1 text-xs font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              {clockSearchQuery && (
                <button
                  type="button"
                  onClick={() => setClockSearchQuery("")}
                  className="absolute right-2 text-[0.65rem] font-black text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Instant Search Results Pills */}
            {clockSearchQuery.trim() !== "" && (
              <div className="flex flex-wrap items-center gap-1">
                {clockSearchMatches.length === 0 ? (
                  <span className="text-[0.65rem] font-bold text-slate-500">
                    No matching Game Clock found
                  </span>
                ) : (
                  clockSearchMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSnapBoxToSecond(m.recTimeSec)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 px-2 py-0.5 text-[0.62rem] font-black text-amber-200 cursor-pointer"
                      title="Click to jump Playhead & 10s Replay Box to this Game Clock"
                    >
                      <Clock className="h-2.5 w-2.5 text-amber-400" />
                      <span>{m.gameClockLabel}</span>
                      <span className="text-slate-400">({formatClock(m.recTimeSec)})</span>
                      <span className="text-white">{m.title}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right: Stamp Game Clock Tag onto Timeline */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.62rem] font-black uppercase text-slate-400 flex items-center gap-1">
              <Tag className="h-3 w-3 text-emerald-400" />
              Tag Game Clock ({isRecording ? `${getPeriodLabel(period)} ${formatClock(clockSeconds)}` : getGameClockLabelAtSec(timelinePlayheadSec)}):
            </span>
            {[
              { label: "🏀 3PT Shot", tag: "3PT Shot" },
              { label: "⚡ Highlight", tag: "Highlight" },
              { label: "🚨 Foul / Review", tag: "Foul/Review" },
            ].map((preset) => (
              <button
                key={preset.tag}
                type="button"
                onClick={() => handleAddClockTag(preset.tag)}
                className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-1 text-[0.62rem] font-black text-emerald-300 cursor-pointer transition-colors"
                title="Bookmark this exact Game Clock moment on the timeline"
              >
                + {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddClockTag();
                }}
                placeholder="Custom play note..."
                className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[0.65rem] font-bold text-white focus:outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => handleAddClockTag()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[0.62rem] font-black uppercase text-white cursor-pointer"
              >
                + Tag Clock
              </button>
            </div>
          </div>
        </div>

        {timelineNotice && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 flex items-center justify-between">
            <span>{timelineNotice}</span>
            <button
              type="button"
              onClick={() => setTimelineNotice(null)}
              className="text-amber-200 hover:text-white text-xs font-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* MAIN TIMELINE WORKSPACE: REPLAY INSPECTOR (LEFT) + STEADY UNCOMPRESSED SCROLLABLE TRACK (RIGHT) */}
        <div className="rounded-xl border border-slate-800 bg-[#0b0e15] p-3 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* LEFT 3 COLS: REPLAY INSPECTOR (TEST & RUN REPLAY BEFORE PUTTING IT IN LIVE) */}
            <div className="lg:col-span-3 flex flex-col justify-between rounded-xl border border-amber-500/40 bg-[#121722] p-2.5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isPlayingInspectorReplay ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                    }`}
                  />
                  Replay Inspector
                </span>
                <span className="rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[0.6rem] font-black text-amber-300">
                  🏀 {getGameClockLabelAtSec(timelinePlayheadSec)}
                </span>
              </div>

              {/* Interactive Replay Inspector Video Monitor */}
              <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-slate-700 flex items-center justify-center">
                <video
                  ref={timelineScrubVideoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-contain ${
                    selectedTimelineVideo || isPlayingInspectorReplay ? "block" : "hidden"
                  }`}
                />
                {!isPlayingInspectorReplay && activePlayheadFrame && (
                  <img
                    src={activePlayheadFrame.dataUrl}
                    alt="Replay Inspector Frame"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}
                {!isPlayingInspectorReplay && !activePlayheadFrame && !selectedTimelineVideo && (
                  <span className="text-[0.65rem] font-bold text-slate-500 text-center px-3">
                    Start recording or select a saved clip to test-run replays here before going Live
                  </span>
                )}

                {/* Top Badge: Inspector Status */}
                <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-wider ${
                      isPlayingInspectorReplay
                        ? "bg-emerald-600/95 text-white"
                        : "bg-slate-900/90 text-amber-300 border border-amber-500/40"
                    }`}
                  >
                    {isPlayingInspectorReplay
                      ? `▶ RUNNING REPLAY (${selectedReplaySpeed}x)`
                      : `⏸ CUED [${formatClock(trimStartSec)}–${formatClock(trimEndSec)}]`}
                  </span>
                  <span className="rounded bg-black/80 px-1.5 py-0.5 text-[0.55rem] font-mono text-slate-200">
                    {(trimEndSec - trimStartSec).toFixed(1)}s Box
                  </span>
                </div>

                {/* Bottom Overlay: Playhead Time & Game Clock */}
                <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between rounded bg-black/85 px-1.5 py-0.5 text-[0.58rem] font-mono text-white pointer-events-none">
                  <span>Rec: {formatPreciseTime(timelinePlayheadSec)}</span>
                  <span className="text-amber-300 font-bold">
                    {getGameClockLabelAtSec(timelinePlayheadSec)}
                  </span>
                </div>
              </div>

              {/* Replay Inspector Transport: Run/Pause Replay + Restart [IN] + Speed Selector */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={handleToggleInspectorReplay}
                    className={`col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[0.68rem] font-black uppercase tracking-wider cursor-pointer transition-all shadow ${
                      isPlayingInspectorReplay
                        ? "bg-rose-600 hover:bg-rose-500 text-white"
                        : "bg-amber-400 hover:bg-amber-300 text-slate-950"
                    }`}
                    title="Run or pause the selected Replay Box right inside the Replay Inspector before pushing to Live"
                  >
                    {isPlayingInspectorReplay ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Pause Replay</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Run Replay ({selectedReplaySpeed}x)</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartInspectorReplay}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 py-1.5 text-[0.62rem] font-black uppercase text-slate-200 cursor-pointer"
                    title="Restart Replay from [IN] mark"
                  >
                    <RotateCcw className="h-3 w-3 text-amber-400" />
                    <span>Restart</span>
                  </button>
                </div>

                {/* Inspector Slow-Mo Speed Pills */}
                <div className="grid grid-cols-4 gap-1">
                  {[0.25, 0.5, 0.75, 1.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSelectedReplaySpeed(spd)}
                      className={`rounded py-0.5 text-[0.6rem] font-black cursor-pointer border transition-colors ${
                        selectedReplaySpeed === spd
                          ? "bg-amber-500/25 border-amber-400 text-amber-200"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {/* Add Play Replay to Preview OR Push Directly to Live */}
                <div className="grid grid-cols-2 gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleCreateReplaySceneFromTimeline(false)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-1.5 px-2 text-[0.62rem] font-black uppercase text-white cursor-pointer shadow"
                    title="Add this inspected replay as a Scene and cue it on Left Preview"
                  >
                    <Scissors className="h-3 w-3 shrink-0" />
                    <span className="truncate">+ Cue in Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateReplaySceneFromTimeline(true)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 py-1.5 px-2 text-[0.62rem] font-black uppercase text-white cursor-pointer shadow"
                    title="Add this inspected replay and immediately air it on Right Live Output"
                  >
                    <Zap className="h-3 w-3 shrink-0" />
                    <span className="truncate">Push to Live</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT 9 COLS: STEADY UNCOMPRESSED HORIZONTAL SCROLLABLE MULTI-TRACK TIMELINE */}
            <div className="lg:col-span-9 flex flex-col rounded-xl border border-slate-700 bg-[#080b11] overflow-hidden">
              {/* Top Info Strip above Scrollbar Track */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[0.62rem]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-black text-rose-400">
                    ▼ PLAYHEAD: {formatPreciseTime(timelinePlayheadSec)} ({getGameClockLabelAtSec(timelinePlayheadSec)})
                  </span>
                  <span className="font-black text-amber-400">
                    📦 STEADY REPLAY BOX ({(trimEndSec - trimStartSec).toFixed(1)}s): Rec{" "}
                    {formatPreciseTime(trimStartSec)} → {formatPreciseTime(trimEndSec)} | 🏀{" "}
                    {getGameClockLabelAtSec(trimStartSec)} → {getGameClockLabelAtSec(trimEndSec)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSnapBoxToSecond(timelinePlayheadSec, replayBoxDurationPreset)
                    }
                    className="rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 px-2 py-0.5 text-[0.6rem] font-black uppercase text-amber-300 cursor-pointer"
                  >
                    📦 Snap Box Here
                  </button>
                  <button
                    type="button"
                    onClick={handleJumpToLatestTime}
                    className="rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 px-2 py-0.5 text-[0.6rem] font-black uppercase text-sky-300 cursor-pointer flex items-center gap-1"
                  >
                    <SkipForward className="h-3 w-3" />
                    <span>Latest Time ({formatClock(activeTimelineDuration)})</span>
                  </button>
                </div>
              </div>

              {/* HORIZONTAL SCROLLABLE CONTAINER (STEADY ON SCREEN — NO AUTO-JUMPING!) */}
              <div
                ref={timelineScrollContainerRef}
                className="w-full overflow-x-scroll overflow-y-hidden pb-2 select-none"
                style={{
                  scrollbarWidth: "auto",
                  scrollbarColor: "#f59e0b #0f172a",
                }}
              >
                <div
                  ref={timelineTrackInnerRef}
                  className="relative"
                  style={{
                    width: `${totalTimelineWidthPx}px`,
                    minWidth: "100%",
                  }}
                >
                  {/* =========================================================
                      TRACK 1: DUAL TIME & GAME CLOCK RULER (CLICK/DRAG TO SCRUB PLAYHEAD)
                     ========================================================= */}
                  <div
                    onPointerDown={(e) => startTimelineDrag(e, "playhead")}
                    onPointerMove={(e) => moveTimelineDrag(e, "playhead")}
                    onPointerUp={endTimelineDrag}
                    onLostPointerCapture={endTimelineDrag}
                    className="relative h-8 w-full bg-slate-950 border-b border-slate-800 cursor-ew-resize touch-none select-none"
                    style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    title="Click or drag anywhere on the ruler to move the Playhead"
                  >
                    {Array.from({ length: Math.ceil(activeTimelineDuration) + 1 }).map(
                      (_, sec) => {
                        const leftPx = sec * timelineZoomPxPerSec;
                        const showFullLabel =
                          timelineZoomPxPerSec >= 56 ||
                          sec % Math.max(1, Math.ceil(56 / timelineZoomPxPerSec)) === 0;
                        const frameAtSec = displayTimelineFrames.find(
                          (f) => Math.round(f.timeSec) === sec
                        );
                        const gClock = frameAtSec?.gameClockLabel || getGameClockLabelAtSec(sec);

                        return (
                          <div
                            key={sec}
                            className="absolute top-0 bottom-0 border-l border-slate-800 flex flex-col justify-between pl-1 py-0.5 pointer-events-none"
                            style={{ left: `${leftPx}px` }}
                          >
                            {showFullLabel && (
                              <>
                                <span className="text-[0.55rem] font-black text-amber-400/90 whitespace-nowrap leading-none">
                                  🏀 {gClock}
                                </span>
                                <span className="text-[0.52rem] font-mono text-slate-400 whitespace-nowrap leading-none">
                                  Rec {formatClock(sec)}
                                </span>
                              </>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>

                  {/* =========================================================
                      TRACK 2: GAME CLOCK BOOKMARK TAGS TRACK
                     ========================================================= */}
                  <div className="relative h-7 w-full bg-[#0e1420] border-b border-slate-800/90 flex items-center">
                    <span className="sticky left-2 z-10 rounded bg-slate-900/90 border border-slate-700 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-emerald-400 pointer-events-none">
                      🏷️ Game Clock Tags
                    </span>

                    {displayClockTags.map((tag) => {
                      const leftPx = tag.recTimeSec * timelineZoomPxPerSec;
                      return (
                        <div
                          key={tag.id}
                          style={{ left: `${leftPx}px` }}
                          className="absolute top-1 z-20 -translate-x-1/2 flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 border border-emerald-300 px-1.5 py-0.5 text-[0.56rem] font-black text-white shadow cursor-pointer whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSnapBoxToSecond(tag.recTimeSec);
                          }}
                          title={`Click to jump Playhead & ${replayBoxDurationPreset}s Replay Box to ${tag.gameClockLabel} (${tag.label})`}
                        >
                          <span>🏀 {tag.gameClockLabel}</span>
                          <span className="text-emerald-100">• {tag.label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveClockTag(tag.id);
                            }}
                            className="ml-0.5 text-emerald-200 hover:text-rose-200"
                            title="Remove tag"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* =========================================================
                      TRACK 3: UNCOMPRESSED CAMERA FILMSTRIP + STEADY 10-SECOND DRAGGABLE REPLAY BOX
                     ========================================================= */}
                  <div
                    className="relative h-28 w-full bg-slate-900/80 overflow-hidden"
                    onClick={(e) => {
                      const sec = clientXToTimelineSec(e.clientX);
                      handleScrubTimeline(sec);
                    }}
                    onDoubleClick={(e) => {
                      const sec = clientXToTimelineSec(e.clientX);
                      handleSnapBoxToSecond(sec, replayBoxDurationPreset);
                    }}
                  >
                    {/* 1-Second Camera Thumbnail Tiles (Each tile is exactly timelineZoomPxPerSec wide!) */}
                    {displayTimelineFrames.length > 0 ? (
                      displayTimelineFrames.map((f, idx) => {
                        const tileLeft = f.timeSec * timelineZoomPxPerSec;
                        const gClock = f.gameClockLabel || getGameClockLabelAtSec(f.timeSec);
                        return (
                          <div
                            key={idx}
                            style={{
                              left: `${tileLeft}px`,
                              width: `${timelineZoomPxPerSec}px`,
                            }}
                            className="absolute top-0 bottom-0 border-r border-slate-800/80 overflow-hidden group cursor-pointer"
                            title={`Rec ${formatClock(f.timeSec)} • Game Clock ${gClock} (Click = Move Playhead, Double-Click = Snap 10s Replay Box)`}
                          >
                            <img
                              src={f.dataUrl}
                              alt={`Frame ${f.timeSec}s`}
                              draggable={false}
                              className="h-full w-full object-cover opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none"
                            />
                            {/* Game Clock Tag Badge on top of Frame */}
                            <span className="absolute top-1 left-1 rounded bg-black/80 border border-amber-500/40 px-1 py-0.2 text-[0.52rem] font-black text-amber-300 pointer-events-none truncate max-w-[92%]">
                              {gClock}
                            </span>
                            {/* Recording Timestamp Badge on bottom of Frame */}
                            <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.2 text-[0.52rem] font-mono text-slate-200 pointer-events-none">
                              {formatClock(f.timeSec)}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="sticky left-0 flex h-full w-full max-w-2xl flex-col items-start justify-center px-6 text-slate-400 gap-1 pointer-events-none">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-300">
                          Steady Camera Timeline Track ({timelineZoomPxPerSec}px / sec)
                        </p>
                        <p className="text-[0.68rem] text-slate-400">
                          Click &quot;Start Live Record&quot; to record the game with automatic Game Clock tags on every frame. The Replay Selection Box stays steady where you place it—click &quot;Jump to Latest Time&quot; anytime to snap to the live edge!
                        </p>
                      </div>
                    )}

                    {/* =======================================================
                        STEADY DRAGGABLE 10-SECOND REPLAY SELECTION BOX OVERLAY
                       ======================================================= */}
                    <div
                      style={{
                        left: `${trimStartSec * timelineZoomPxPerSec}px`,
                        width: `${Math.max(
                          24,
                          (trimEndSec - trimStartSec) * timelineZoomPxPerSec
                        )}px`,
                      }}
                      className="absolute top-0 bottom-0 z-20 bg-amber-500/20 border-y-2 border-amber-400 flex flex-col justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Top Drag Grip Handle (Slide Entire 10-Second Box Left/Right!) */}
                      <div
                        tabIndex={0}
                        role="slider"
                        aria-label="Draggable 10-second Replay Selection Box (use Left/Right arrow keys or drag to move)"
                        aria-valuemin={0}
                        aria-valuemax={activeTimelineDuration}
                        aria-valuenow={trimStartSec}
                        onPointerDown={(e) => startTimelineDrag(e, "box_move")}
                        onPointerMove={(e) => moveTimelineDrag(e, "box_move")}
                        onPointerUp={endTimelineDrag}
                        onLostPointerCapture={endTimelineDrag}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                            e.preventDefault();
                            const step = e.shiftKey ? 2 : 0.5;
                            const dir = e.key === "ArrowLeft" ? -step : step;
                            const boxW = trimEndSec - trimStartSec;
                            const nextStart = Math.max(
                              0,
                              Math.min(activeTimelineDuration - boxW, Number((trimStartSec + dir).toFixed(1)))
                            );
                            setTrimStartSec(nextStart);
                            setTrimEndSec(Number((nextStart + boxW).toFixed(1)));
                            handleScrubTimeline(nextStart);
                          }
                        }}
                        style={{
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                        }}
                        className={`w-full bg-amber-400 hover:bg-amber-300 text-slate-950 px-2 py-1 flex items-center justify-between gap-1 shadow-md ${
                          activeDragMode === "box_move" ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        title="Drag this header bar left or right to slide the steady 10-second Replay Selection Box across the timeline"
                      >
                        <span className="sticky left-1 text-[0.58rem] font-black uppercase tracking-wider truncate flex items-center gap-1">
                          <GripHorizontal className="h-3 w-3 shrink-0" />
                          <span>
                            {(trimEndSec - trimStartSec).toFixed(1)}s REPLAY BOX •{" "}
                            {formatClock(trimStartSec)}–{formatClock(trimEndSec)}
                          </span>
                        </span>
                        <span className="rounded bg-slate-950/90 text-amber-300 px-1.5 py-0.2 text-[0.55rem] font-black whitespace-nowrap">
                          🏀 {getGameClockLabelAtSec(trimStartSec)} → {getGameClockLabelAtSec(trimEndSec)}
                        </span>
                      </div>

                      {/* Bottom Timestamp Readout inside Box */}
                      <div className="px-2 pb-1 flex items-center justify-between text-[0.56rem] font-black text-amber-200 pointer-events-none drop-shadow">
                        <span className="bg-black/75 px-1.5 py-0.5 rounded">
                          [ IN: {formatPreciseTime(trimStartSec)}
                        </span>
                        <span className="bg-black/75 px-1.5 py-0.5 rounded">
                          OUT: {formatPreciseTime(trimEndSec)} ]
                        </span>
                      </div>

                      {/* Left Resize Handle ([ IN) */}
                      <div
                        onPointerDown={(e) => startTimelineDrag(e, "box_left")}
                        onPointerMove={(e) => moveTimelineDrag(e, "box_left")}
                        onPointerUp={endTimelineDrag}
                        onLostPointerCapture={endTimelineDrag}
                        style={{
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                        }}
                        className="absolute left-0 top-0 bottom-0 w-2.5 bg-amber-400 hover:bg-white cursor-ew-resize flex items-center justify-center shadow"
                        title="Drag left edge to adjust Replay Start [IN]"
                      >
                        <div className="h-6 w-0.5 bg-slate-950 rounded" />
                      </div>

                      {/* Right Resize Handle (OUT ]) */}
                      <div
                        onPointerDown={(e) => startTimelineDrag(e, "box_right")}
                        onPointerMove={(e) => moveTimelineDrag(e, "box_right")}
                        onPointerUp={endTimelineDrag}
                        onLostPointerCapture={endTimelineDrag}
                        style={{
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                        }}
                        className="absolute right-0 top-0 bottom-0 w-2.5 bg-amber-400 hover:bg-white cursor-ew-resize flex items-center justify-center shadow"
                        title="Drag right edge to adjust Replay End [OUT]"
                      >
                        <div className="h-6 w-0.5 bg-slate-950 rounded" />
                      </div>
                    </div>
                  </div>

                  {/* =========================================================
                      FULL-HEIGHT INTERACTIVE PLAYHEAD (DRAGGABLE CAP + VERTICAL LINE)
                     ========================================================= */}
                  <div
                    style={{
                      left: `${timelinePlayheadSec * timelineZoomPxPerSec}px`,
                    }}
                    className="absolute top-0 bottom-0 z-30 w-0.5 bg-rose-500 pointer-events-none"
                  >
                    {/* Draggable Playhead Cap Handle */}
                    <div
                      tabIndex={0}
                      role="slider"
                      aria-label="Timeline Playhead (drag or use Left/Right arrow keys to scrub)"
                      aria-valuemin={0}
                      aria-valuemax={activeTimelineDuration}
                      aria-valuenow={timelinePlayheadSec}
                      onPointerDown={(e) => startTimelineDrag(e, "playhead")}
                      onPointerMove={(e) => moveTimelineDrag(e, "playhead")}
                      onPointerUp={endTimelineDrag}
                      onLostPointerCapture={endTimelineDrag}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          const step = e.shiftKey ? 2 : 0.5;
                          const dir = e.key === "ArrowLeft" ? -step : step;
                          handleScrubTimeline(timelinePlayheadSec + dir);
                        }
                      }}
                      style={{
                        touchAction: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                      className={`pointer-events-auto -ml-14 mt-0.5 inline-flex items-center gap-1 rounded-full bg-rose-600 hover:bg-rose-500 border border-white px-2 py-0.5 text-[0.55rem] font-black text-white shadow-lg whitespace-nowrap ${
                        activeDragMode === "playhead" ? "cursor-grabbing scale-105" : "cursor-grab"
                      }`}
                      title="Drag Playhead to scrub across the recording"
                    >
                      <span>▼ {formatPreciseTime(timelinePlayheadSec)}</span>
                      <span className="text-amber-200">
                        ({getGameClockLabelAtSec(timelinePlayheadSec)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ACTION BAR: REPLAY BOX DURATION PRESETS (5s / 10s / 15s) + JUMP TO LATEST + CREATE REPLAY SCENE */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
            {/* Left: Replay Selection Box Size Presets (Default 10s Box!) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.65rem] font-black uppercase text-amber-400 mr-1">
                📦 Replay Box Size:
              </span>
              {[5, 10, 15, 20].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleSetReplayBoxPreset(sec)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-black cursor-pointer border transition-colors ${
                    Math.round(trimEndSec - trimStartSec) === sec
                      ? "bg-amber-400 border-amber-300 text-slate-950"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {sec}s Box{sec === 10 ? " (Default)" : ""}
                </button>
              ))}

              <button
                type="button"
                onClick={handleJumpToLatestTime}
                className="rounded-lg border border-amber-400/50 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1 text-[0.65rem] font-black uppercase text-amber-300 flex items-center gap-1 cursor-pointer"
                title="Jump the Replay Box and Playhead to the latest recorded timestamp"
              >
                <SkipForward className="h-3 w-3" />
                <span>Jump to Latest Time</span>
              </button>
            </div>

            {/* Right: Slow-Mo Speed, Replay Scene Label & Create Replay Scene Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Slow Motion Speed Selector */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-800 p-1">
                <span className="text-[0.62rem] font-black uppercase text-slate-400 px-2">
                  Speed:
                </span>
                {[0.25, 0.5, 0.75, 1.0].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSelectedReplaySpeed(spd)}
                    className={`rounded-lg px-2 py-1 text-xs font-black cursor-pointer transition-colors ${
                      selectedReplaySpeed === spd
                        ? "bg-amber-400 text-slate-950"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={replayClipLabel}
                onChange={(e) => setReplayClipLabel(e.target.value)}
                placeholder="Replay label (e.g. Q4 Clutch 3PT)"
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400 w-48"
              />

              <button
                type="button"
                onClick={handleToggleInspectorReplay}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-400/50 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-300 shadow cursor-pointer"
                title="Run or pause this replay inside the Replay Inspector before putting it in Live"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{isPlayingInspectorReplay ? "Pause Inspector" : "Run in Inspector"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateReplaySceneFromTimeline(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer"
                title="Create a selectable Replay Scene from the 10s Box and cue it on Left Preview"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>Add Replay to Preview</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateReplaySceneFromTimeline(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md cursor-pointer"
                title="Create Replay Scene from the 10s Box and immediately air it on Right Live Output"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Instant Replay to Live</span>
              </button>
            </div>
          </div>

          {/* =================================================================
              LIVE PLAY-BY-PLAY FEED BELOW THE CAMERA TIMELINE
              (CLICK ANY PLAY TO JUMP TO WHERE IT WAS CAPTURED ON THE TIMELINE!)
             ================================================================= */}
          <div className="rounded-xl border border-slate-800 bg-[#0d121d] p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[0.65rem]">
                  🏀
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Live Play-by-Play Feed • Click Any Play to Jump to Timeline Capture
                </span>
                <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[0.6rem] font-bold text-slate-300">
                  {(liveSession?.playEvents?.length || 0) + displayClockTags.length} Plays
                </span>
              </div>
              <span className="text-[0.62rem] font-bold text-amber-300">
                💡 Click a play below → Jumps Playhead &amp; {replayBoxDurationPreset}s Replay Box to that moment &amp; loads Replay Inspector
              </span>
            </div>

            {(!liveSession?.playEvents || liveSession.playEvents.length === 0) &&
            displayClockTags.length === 0 ? (
              <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  No live Play-by-Play events recorded yet. Score plays in the Live Scorebook or click{" "}
                  <strong className="text-emerald-400">+ 🏀 3PT Shot / + ⚡ Highlight</strong> above to tag plays on the timeline!
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
                {/* 1. Official Live Scorebook Play-by-Play Events */}
                {(liveSession?.playEvents || []).slice(0, 40).map((ev) => {
                  const pLabel = ev.periodLabel || `Q${ev.period}`;
                  const matchedSec = resolvePlayEventTimelineSec(
                    ev.id,
                    pLabel,
                    ev.gameClockDisplay,
                    ev.createdAt
                  );
                  const clockDisplay = `${pLabel} ${ev.gameClockDisplay}`;
                  const isHome = ev.teamSide === "HOME";
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() =>
                        handleJumpToPlayByPlayOnTimeline(
                          matchedSec,
                          clockDisplay,
                          `${ev.teamName}: ${ev.description}`
                        )
                      }
                      className="shrink-0 group flex flex-col items-start gap-1 rounded-xl border border-slate-700/90 hover:border-amber-400 bg-slate-900/90 hover:bg-slate-800/90 px-3 py-2 text-left transition-all cursor-pointer shadow-sm min-w-[210px] max-w-[260px]"
                      title={`Click to jump timeline to ${clockDisplay} (Rec ${formatClock(matchedSec)}) and cue in Replay Inspector`}
                    >
                      <div className="w-full flex items-center justify-between gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[0.58rem] font-black text-amber-300">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{clockDisplay}</span>
                        </span>
                        <span className="text-[0.56rem] font-mono font-bold text-sky-400 group-hover:text-amber-300">
                          Rec {formatClock(matchedSec)} ↗
                        </span>
                      </div>
                      <div className="w-full flex items-center justify-between gap-1">
                        <span className="text-[0.68rem] font-black text-white truncate">
                          {ev.playerJersey ? `#${ev.playerJersey} ` : ""}
                          {ev.description}
                        </span>
                        {ev.pointsDelta && ev.pointsDelta > 0 ? (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.2 text-[0.56rem] font-black ${
                              isHome
                                ? "bg-rose-600/30 text-rose-300 border border-rose-500/40"
                                : "bg-blue-600/30 text-blue-300 border border-blue-500/40"
                            }`}
                          >
                            +{ev.pointsDelta}
                          </span>
                        ) : null}
                      </div>
                      <div className="w-full flex items-center justify-between text-[0.56rem] text-slate-400">
                        <span className="truncate font-bold">{ev.teamName}</span>
                        <span className="font-mono text-slate-300">
                          {ev.homeScoreAfter} - {ev.awayScoreAfter}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* 2. Timeline Tagged Plays (if not already in playEvents) */}
                {displayClockTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      handleJumpToPlayByPlayOnTimeline(
                        tag.recTimeSec,
                        tag.gameClockLabel,
                        tag.label
                      )
                    }
                    className="shrink-0 group flex flex-col items-start gap-1 rounded-xl border border-emerald-500/40 hover:border-amber-400 bg-emerald-950/30 hover:bg-emerald-900/40 px-3 py-2 text-left transition-all cursor-pointer shadow-sm min-w-[185px]"
                    title={`Click to jump timeline to ${tag.gameClockLabel} (Rec ${formatClock(tag.recTimeSec)})`}
                  >
                    <div className="w-full flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 text-[0.58rem] font-black text-emerald-300">
                        <span>🏀 {tag.gameClockLabel}</span>
                      </span>
                      <span className="text-[0.56rem] font-mono font-bold text-emerald-300 group-hover:text-amber-300">
                        Rec {formatClock(tag.recTimeSec)} ↗
                      </span>
                    </div>
                    <span className="text-[0.68rem] font-black text-white truncate w-full">
                      {tag.label}
                    </span>
                    <span className="text-[0.55rem] font-bold text-slate-400">
                      Click to inspect &amp; replay
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. LOWER OBS DOCKS: SCENES | MULTI-CAMERA SOURCES | SCOREBUG | STREAM & STORAGE
         ===================================================================== */}
      <section className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3 sm:p-4 bg-[#0b0e14]">
        {/* DOCK 1: SCENES LIST (Camera Scenes & Created Replay Scenes) */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-[#131926] overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              1. Scenes ({scenes.length})
            </span>
            <span className="text-[0.62rem] font-bold text-slate-400">
              Click = Preview
            </span>
          </div>

          <div className="p-2.5 flex-1 space-y-1.5 overflow-y-auto max-h-72">
            {scenes.map((scene) => {
              const isPreview = scene.id === previewSceneId;
              const isLive = scene.id === liveSceneId;
              return (
                <div
                  key={scene.id}
                  onClick={() => setPreviewSceneId(scene.id)}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer border ${
                    isPreview
                      ? "bg-emerald-950/50 border-emerald-500/70 text-white"
                      : "bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black truncate">{scene.name}</span>
                    </div>
                    <div className="text-[0.62rem] text-slate-400 mt-0.5 flex items-center gap-1.5">
                      {scene.kind === "replay_scene" ? (
                        <span className="text-amber-300 font-bold">
                          Slow-Mo {scene.replayConfig?.playbackRate}x ({formatClock(scene.replayConfig?.startSec || 0)}-{formatClock(scene.replayConfig?.endSec || 0)})
                        </span>
                      ) : scene.kind === "video_scene" ? (
                        <span className="text-sky-300 font-bold truncate">
                          🎬 Video • {scene.mediaConfig?.fileName}
                        </span>
                      ) : scene.kind === "picture_scene" ? (
                        <span className="text-purple-300 font-bold truncate">
                          🖼️ Picture • {scene.mediaConfig?.fileName}
                        </span>
                      ) : (
                        <span>
                          {scene.cameras.length} Camera(s) • {scene.layout.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isPreview && (
                      <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-slate-950">
                        PRV
                      </span>
                    )}
                    {isLive && (
                      <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-white">
                        LIVE
                      </span>
                    )}
                    {scenes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteScene(scene.id);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Remove scene"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Scene Footer (Camera Scene + Video Scene + Picture Scene) */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/60 space-y-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newSceneNameInput}
                onChange={(e) => setNewSceneNameInput(e.target.value)}
                placeholder="New scene name..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddScene}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1.5 text-xs font-black uppercase text-white cursor-pointer"
                title="Add Camera Scene"
              >
                <Plus className="h-3.5 w-3.5" />
                Cam
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-600/20 hover:bg-sky-600/30 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-sky-300 cursor-pointer transition-colors">
                <Film className="h-3.5 w-3.5" />
                <span>+ Add Video</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleAddMediaScene(e, "video")}
                  className="hidden"
                />
              </label>

              <label className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/30 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-purple-300 cursor-pointer transition-colors">
                <Plus className="h-3.5 w-3.5" />
                <span>+ Add Picture</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAddMediaScene(e, "picture")}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* DOCK 2: MULTI-CAMERA SOURCES, LAYOUT & AUDIO MIXER */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-[#131926] overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5 truncate">
              <Camera className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span>
                2. Sources ({previewScene?.cameras.length || (previewScene?.mediaConfig ? 1 : 0)} Cam • {audioSources.length} Audio)
              </span>
            </span>
            {previewScene?.kind === "camera_scene" && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleAddWirelessPhoneCameraToPreviewScene("iphone")
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white cursor-pointer"
                  title="Add iPhone or Android Phone as a Wireless Camera"
                >
                  <Smartphone className="h-3 w-3" />
                  <span>+ Phone Cam</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddCameraToPreviewScene}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ Cam</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-96">
            {wirelessCamNotice && (
              <div className="rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-2.5 py-1.5 text-[0.62rem] font-bold text-emerald-200 flex items-center justify-between gap-2">
                <span>{wirelessCamNotice}</span>
                <button
                  type="button"
                  onClick={() => setWirelessCamNotice(null)}
                  className="text-emerald-300 hover:text-white font-black cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {previewScene?.kind === "replay_scene" ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <p className="font-black text-amber-300 uppercase">
                  🎬 Replay Scene Selected
                </p>
                <p className="text-slate-300 text-[0.7rem]">
                  Clip: <strong>{previewScene.replayConfig?.videoTitle}</strong>
                </p>
                <p className="text-slate-300 text-[0.7rem]">
                  Window: <strong>{formatClock(previewScene.replayConfig?.startSec || 0)}</strong> to{" "}
                  <strong>{formatClock(previewScene.replayConfig?.endSec || 0)}</strong> at{" "}
                  <strong>{previewScene.replayConfig?.playbackRate}x Slow-Mo</strong>
                </p>
                <button
                  type="button"
                  onClick={handleCutToLive}
                  className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 py-2 text-xs font-black uppercase text-white cursor-pointer mt-2"
                >
                  Push Replay to Live Program →
                </button>
              </div>
            ) : previewScene?.kind === "video_scene" ||
              previewScene?.kind === "picture_scene" ? (
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black uppercase text-sky-300">
                    {previewScene.kind === "video_scene"
                      ? "🎬 Video Media Scene"
                      : "🖼️ Picture / Graphic Scene"}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[0.6rem] font-bold text-slate-300 truncate max-w-[140px]">
                    {previewScene.mediaConfig?.fileName}
                  </span>
                </div>

                <div className="rounded-lg bg-amber-950/40 border border-amber-500/30 px-2.5 py-1.5 text-[0.62rem] font-bold text-amber-200">
                  ℹ️ Scorebug &amp; Player Stats overlays are automatically hidden while a Picture or Video scene is active.
                </div>

                {previewScene.kind === "picture_scene" && (
                  <div className="space-y-1">
                    <label className="text-[0.62rem] font-black uppercase text-slate-400">
                      Image Fit Mode:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["contain", "cover"] as const).map((fitMode) => (
                        <button
                          key={fitMode}
                          type="button"
                          onClick={() =>
                            setScenes((prev) =>
                              prev.map((s) =>
                                s.id === previewScene.id && s.mediaConfig
                                  ? {
                                      ...s,
                                      mediaConfig: {
                                        ...s.mediaConfig,
                                        objectFit: fitMode,
                                      },
                                    }
                                  : s
                              )
                            )
                          }
                          className={`rounded-lg py-1 text-[0.65rem] font-black uppercase border cursor-pointer ${
                            (previewScene.mediaConfig?.objectFit ?? "contain") ===
                            fitMode
                              ? "bg-purple-600 border-purple-400 text-white"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          {fitMode === "contain" ? "Fit Full Image" : "Fill 16:9 Screen"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 py-1.5 text-[0.65rem] font-black uppercase text-slate-200 cursor-pointer">
                  <span>
                    Replace {previewScene.kind === "video_scene" ? "Video" : "Picture"} File
                  </span>
                  <input
                    type="file"
                    accept={
                      previewScene.kind === "video_scene" ? "video/*" : "image/*"
                    }
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      setScenes((prev) =>
                        prev.map((s) =>
                          s.id === previewScene.id && s.mediaConfig
                            ? {
                                ...s,
                                mediaConfig: {
                                  ...s.mediaConfig,
                                  url,
                                  fileName: file.name,
                                },
                              }
                            : s
                        )
                      );
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleCutToLive}
                  className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 py-2 text-xs font-black uppercase text-white cursor-pointer"
                >
                  Put Scene on Live Program →
                </button>
              </div>
            ) : (
              <>
                {/* Multi-Cam Layout Mode Picker */}
                <div className="space-y-1">
                  <label className="text-[0.62rem] font-black uppercase text-slate-400">
                    Scene Camera Layout:
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: "single", label: "1-Cam" },
                      { id: "split_50_50", label: "2-Split" },
                      { id: "pip_bottom_right", label: "PiP" },
                      { id: "quad_grid", label: "4-Quad" },
                    ].map((ly) => (
                      <button
                        key={ly.id}
                        type="button"
                        onClick={() =>
                          previewScene &&
                          handleSetSceneLayout(
                            previewScene.id,
                            ly.id as SceneLayoutMode
                          )
                        }
                        className={`rounded-lg py-1 text-[0.65rem] font-black uppercase border cursor-pointer ${
                          previewScene?.layout === ly.id
                            ? "bg-sky-600 border-sky-400 text-white"
                            : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                        }`}
                      >
                        {ly.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SAVED WIRELESS CAMERAS LIBRARY (REUSE IPHONE & ANDROID CAMERAS IN ANY SCENE) */}
                <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[0.62rem] font-black uppercase tracking-wider text-sky-300 flex items-center gap-1">
                      <Bookmark className="h-3 w-3 text-amber-400" />
                      <span>
                        Saved Wireless Cams ({savedWirelessCameras.length})
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleAddWirelessPhoneCameraToPreviewScene("iphone")
                        }
                        className="rounded bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-sky-200 cursor-pointer"
                        title="Pair & Save a new iPhone Wireless Camera"
                      >
                        + 🍎 iPhone
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddWirelessPhoneCameraToPreviewScene("android")
                        }
                        className="rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/40 px-1.5 py-0.5 text-[0.55rem] font-black uppercase text-emerald-200 cursor-pointer"
                        title="Pair & Save a new Android Wireless Camera"
                      >
                        + 🤖 Android
                      </button>
                    </div>
                  </div>

                  {savedWirelessCameras.length === 0 ? (
                    <p className="text-[0.58rem] text-slate-400 leading-snug">
                      No saved wireless cameras yet. Click{" "}
                      <strong className="text-sky-300">Save Cam</strong> on any
                      iPhone or Android wireless camera slot below (or in the QR
                      modal) to reuse it across all Scenes.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {savedWirelessCameras.map((wc) => {
                        const cleanRoom = wc.roomCode.toUpperCase();
                        const roomStatus = wirelessStatusByRoom[cleanRoom];
                        const isLiveConnected =
                          roomStatus === "webrtc" ||
                          roomStatus === "relay" ||
                          roomStatus === "ip";
                        const isInCurrentScene = Boolean(
                          previewScene?.cameras.some(
                            (c) =>
                              c.sourceType === "wireless_phone" &&
                              ((c.wirelessRoomCode || "")
                                .trim()
                                .toUpperCase() === cleanRoom ||
                                c.savedWirelessCamId === wc.id)
                          )
                        );
                        return (
                          <div
                            key={wc.id}
                            className="flex items-center justify-between gap-1.5 rounded-lg bg-slate-900/95 border border-slate-800 px-2 py-1 text-[0.6rem]"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isLiveConnected
                                    ? "bg-emerald-400 animate-pulse"
                                    : "bg-amber-400"
                                }`}
                                title={
                                  isLiveConnected
                                    ? "Wireless camera connected & streaming"
                                    : "Ready / Waiting for phone stream"
                                }
                              />
                              <span className="font-black text-white truncate">
                                {wc.platform === "android" ? "🤖" : "🍎"}{" "}
                                {wc.name}
                              </span>
                              <span className="rounded bg-slate-800 border border-slate-700 px-1 py-0.2 text-[0.54rem] font-mono font-bold text-amber-300 shrink-0">
                                {cleanRoom}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {previewScene && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUseSavedWirelessCameraInScene(
                                      wc,
                                      previewScene.id
                                    )
                                  }
                                  className={`rounded px-1.5 py-0.5 text-[0.55rem] font-black uppercase cursor-pointer border ${
                                    isInCurrentScene
                                      ? "bg-emerald-600/25 border-emerald-500/50 text-emerald-300"
                                      : "bg-sky-600 hover:bg-sky-500 border-sky-400 text-white"
                                  }`}
                                  title={
                                    isInCurrentScene
                                      ? `Already active in ${previewScene.name} (click to refresh)`
                                      : `Use "${wc.name}" in ${previewScene.name}`
                                  }
                                >
                                  {isInCurrentScene
                                    ? "✓ In Scene"
                                    : "+ Use in Scene"}
                                </button>
                              )}

                              {previewScene && previewScene.cameras.length > 0 && (
                                <select
                                  aria-label={`Assign ${wc.name} to camera slot`}
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    handleUseSavedWirelessCameraInScene(
                                      wc,
                                      previewScene.id,
                                      e.target.value
                                    );
                                  }}
                                  className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[0.54rem] font-bold text-slate-300 cursor-pointer max-w-[66px]"
                                  title="Replace a specific Camera Slot in this Scene with this Saved Wireless Camera"
                                >
                                  <option value="">Slot...</option>
                                  {previewScene.cameras.map((c, cIdx) => (
                                    <option key={c.id} value={c.id}>
                                      Set Cam #{cIdx + 1}
                                    </option>
                                  ))}
                                </select>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteSavedWirelessCamera(wc.id)
                                }
                                className="p-0.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                                title="Remove from Saved Wireless Cameras"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Camera Slots List */}
                <div className="space-y-2">
                  {previewScene?.cameras.map((slot, idx) => {
                    const roomKey =
                      slot.sourceType === "wireless_phone"
                        ? (
                            slot.wirelessRoomCode ||
                            `CAM${slot.id.slice(-4).toUpperCase()}`
                          )
                            .trim()
                            .toUpperCase()
                        : "";
                    const effectiveWirelessStatus =
                      (roomKey && wirelessStatusByRoom[roomKey]) ||
                      wirelessStatusBySlot[slot.id];
                    const isActive =
                      slot.sourceType === "wireless_phone"
                        ? activeSlotIds[slot.id] !== false &&
                          (Boolean(activeSlotIds[slot.id]) ||
                            Boolean(effectiveWirelessStatus))
                        : Boolean(activeSlotIds[slot.id]);
                    const matchingSavedCam =
                      slot.sourceType === "wireless_phone"
                        ? savedWirelessCameras.find(
                            (w) =>
                              (slot.savedWirelessCamId &&
                                w.id === slot.savedWirelessCamId) ||
                              w.roomCode.toUpperCase() === roomKey
                          )
                        : undefined;

                    return (
                      <div
                        key={slot.id}
                        className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-2.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {slot.sourceType === "wireless_phone" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateCameraSlot(
                                    previewScene.id,
                                    slot.id,
                                    {
                                      wirelessPlatform:
                                        slot.wirelessPlatform === "android"
                                          ? "iphone"
                                          : "android",
                                    }
                                  )
                                }
                                className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-sky-300 shrink-0 cursor-pointer"
                                title="Click to toggle iPhone / Android label"
                              >
                                {slot.wirelessPlatform === "android"
                                  ? "🤖 Android"
                                  : "🍎 iPhone"}
                              </button>
                            )}
                            <input
                              type="text"
                              value={slot.angleName}
                              onChange={(e) =>
                                handleUpdateCameraSlot(previewScene.id, slot.id, {
                                  angleName: e.target.value,
                                })
                              }
                              className="bg-transparent text-xs font-black text-white focus:outline-none border-b border-transparent focus:border-sky-400 w-full min-w-0"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {slot.sourceType === "wireless_phone" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveWirelessCameraFromSlot(slot)
                                }
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[0.6rem] font-black uppercase cursor-pointer border ${
                                  matchingSavedCam
                                    ? "bg-amber-500/20 border-amber-400/50 text-amber-300 hover:bg-amber-500/30"
                                    : "bg-sky-600 hover:bg-sky-500 border-sky-400 text-white"
                                }`}
                                title="Save this iPhone or Android wireless camera so you can use it in any other Scene"
                              >
                                <Save className="h-2.5 w-2.5" />
                                <span>
                                  {matchingSavedCam ? "Saved ✓" : "Save Cam"}
                                </span>
                              </button>
                            )}
                            {!isActive ? (
                              <button
                                type="button"
                                onClick={() => startCameraSlot(slot)}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white cursor-pointer"
                              >
                                Activate Cam
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => stopCameraSlot(slot.id)}
                                className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-[0.62rem] font-black uppercase text-rose-300 cursor-pointer"
                              >
                                Stop
                              </button>
                            )}
                            {previewScene.cameras.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveCameraSlot(previewScene.id, slot.id)
                                }
                                className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Remove camera from scene"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Source Type & Hardware Device / Saved Wireless Phone Dropdown */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={slot.sourceType}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              if (rawVal.startsWith("saved_wireless:")) {
                                const savedId = rawVal.replace(
                                  "saved_wireless:",
                                  ""
                                );
                                const foundSaved = savedWirelessCameras.find(
                                  (w) => w.id === savedId
                                );
                                if (foundSaved) {
                                  handleUseSavedWirelessCameraInScene(
                                    foundSaved,
                                    previewScene.id,
                                    slot.id
                                  );
                                }
                                return;
                              }
                              const nextType =
                                rawVal as SceneCameraSlot["sourceType"];
                              const defaultRoom =
                                slot.wirelessRoomCode ||
                                `CAM${Math.floor(100 + Math.random() * 900)}`;
                              const updatedSlot: SceneCameraSlot = {
                                ...slot,
                                sourceType: nextType,
                                wirelessRoomCode:
                                  nextType === "wireless_phone"
                                    ? defaultRoom
                                    : slot.wirelessRoomCode,
                                wirelessPlatform:
                                  nextType === "wireless_phone"
                                    ? slot.wirelessPlatform || "iphone"
                                    : slot.wirelessPlatform,
                              };
                              handleUpdateCameraSlot(previewScene.id, slot.id, {
                                sourceType: nextType,
                                wirelessRoomCode: updatedSlot.wirelessRoomCode,
                                wirelessPlatform: updatedSlot.wirelessPlatform,
                              });
                              if (nextType === "wireless_phone") {
                                connectWirelessPhoneSlot(updatedSlot);
                                setPairingWirelessSlot({
                                  sceneId: previewScene.id,
                                  slotId: slot.id,
                                });
                              }
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[0.65rem] font-bold text-slate-200"
                          >
                            <option value="camera">📷 USB / Webcam</option>
                            <option value="wireless_phone">
                              📱 iPhone / Android Wireless Cam
                            </option>
                            <option value="screen">🖥️ Capture Card / Screen</option>
                            <option value="court_sim">🏀 Simulated Court Cam #{idx + 1}</option>
                            {savedWirelessCameras.length > 0 && (
                              <optgroup label="📲 Saved Wireless Cameras (iPhone / Android)">
                                {savedWirelessCameras.map((wc) => (
                                  <option
                                    key={wc.id}
                                    value={`saved_wireless:${wc.id}`}
                                  >
                                    {wc.platform === "android" ? "🤖" : "🍎"}{" "}
                                    {wc.name} ({wc.roomCode})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>

                          {slot.sourceType === "camera" && (
                            <select
                              value={slot.deviceId}
                              onChange={(e) => {
                                handleUpdateCameraSlot(previewScene.id, slot.id, {
                                  deviceId: e.target.value,
                                });
                                startCameraSlot({
                                  ...slot,
                                  deviceId: e.target.value,
                                });
                              }}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[0.65rem] font-bold text-slate-200"
                            >
                              <option value="">Default Camera</option>
                              {videoDevices.map((d, i) => (
                                <option key={d.deviceId || i} value={d.deviceId}>
                                  {d.label || `Camera #${i + 1}`}
                                </option>
                              ))}
                            </select>
                          )}

                          {slot.sourceType === "wireless_phone" && (
                            <button
                              type="button"
                              onClick={() => {
                                connectWirelessPhoneSlot(slot);
                                setPairingWirelessSlot({
                                  sceneId: previewScene.id,
                                  slotId: slot.id,
                                });
                              }}
                              className="rounded-lg bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/50 px-2 py-1 text-[0.62rem] font-black uppercase text-sky-300 flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <QrCode className="h-3 w-3" />
                              <span>
                                Pair QR ({slot.wirelessRoomCode || "CAM"})
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Saved Wireless Camera Switcher when slot is Wireless Phone */}
                        {slot.sourceType === "wireless_phone" &&
                          savedWirelessCameras.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[0.58rem] font-black uppercase text-slate-400 shrink-0">
                                Saved Cam:
                              </span>
                              <select
                                aria-label="Select Saved Wireless Camera for this slot"
                                value={matchingSavedCam?.id || ""}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  if (!selectedId) return;
                                  const found = savedWirelessCameras.find(
                                    (w) => w.id === selectedId
                                  );
                                  if (found) {
                                    handleUseSavedWirelessCameraInScene(
                                      found,
                                      previewScene.id,
                                      slot.id
                                    );
                                  }
                                }}
                                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[0.62rem] font-bold text-amber-300"
                              >
                                <option value="">
                                  -- Custom Room ({roomKey}) --
                                </option>
                                {savedWirelessCameras.map((wc) => (
                                  <option key={wc.id} value={wc.id}>
                                    {wc.platform === "android"
                                      ? "🤖 Android:"
                                      : "🍎 iPhone:"}{" "}
                                    {wc.name} ({wc.roomCode})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                        {slot.sourceType === "wireless_phone" && (
                          <div className="flex items-center justify-between rounded-lg bg-slate-950/90 border border-slate-800 px-2 py-1 text-[0.6rem]">
                            <span className="font-bold text-slate-300">
                              Status:{" "}
                              {effectiveWirelessStatus === "webrtc" ? (
                                <strong className="text-emerald-400">
                                  🟢 Connected (WebRTC HD)
                                </strong>
                              ) : effectiveWirelessStatus === "relay" ? (
                                <strong className="text-emerald-400">
                                  🟢 Connected (Cloud Stream)
                                </strong>
                              ) : effectiveWirelessStatus === "ip" ? (
                                <strong className="text-emerald-400">
                                  🟢 Connected (IP Stream)
                                </strong>
                              ) : (
                                <strong className="text-amber-300">
                                  🟡 Waiting for Phone ({slot.wirelessRoomCode})
                                </strong>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveWirelessCameraFromSlot(slot)
                                }
                                className="text-amber-300 hover:underline font-black uppercase cursor-pointer"
                              >
                                {matchingSavedCam ? "Update Saved" : "Save Cam"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPairingWirelessSlot({
                                    sceneId: previewScene.id,
                                    slotId: slot.id,
                                  })
                                }
                                className="text-sky-400 hover:underline font-black uppercase cursor-pointer"
                              >
                                Show QR
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {cameraError && (
                  <p className="text-[0.65rem] font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2">
                    {cameraError}
                  </p>
                )}
              </>
            )}

            {/* AUDIO SOURCES & MIXER PANEL */}
            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[0.65rem] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <Mic className="h-3.5 w-3.5" />
                  Audio Mixer ({audioSources.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleAddMicAudioSource}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-emerald-300 cursor-pointer"
                    title="Add Microphone / Line-In Audio Source"
                  >
                    <Mic className="h-2.5 w-2.5" />
                    <span>+ Mic</span>
                  </button>
                  <label
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-purple-300 cursor-pointer"
                    title="Upload Audio File / BGM / Stinger Sound (.mp3, .wav, .ogg)"
                  >
                    <Music className="h-2.5 w-2.5" />
                    <span>+ Audio File</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAddFileAudioSource}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                {audioSources.map((src) => {
                  const level = audioLevelsById[src.id] ?? 0;
                  const levelPct = Math.round(Math.min(100, level * 100));
                  return (
                    <div
                      key={src.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/95 p-2 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {src.kind === "mic_input" ? (
                            <Mic className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Music className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                          )}
                          <input
                            type="text"
                            value={src.name}
                            onChange={(e) =>
                              handleUpdateAudioSource(src.id, {
                                name: e.target.value,
                              })
                            }
                            className="bg-transparent text-[0.68rem] font-black text-white focus:outline-none border-b border-transparent focus:border-emerald-400 truncate w-full"
                          />
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!src.isActive ? (
                            <button
                              type="button"
                              onClick={() => startAudioSource(src)}
                              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 text-[0.58rem] font-black uppercase text-white cursor-pointer"
                            >
                              {src.kind === "audio_file" ? "Play" : "Activate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => stopAudioSource(src.id)}
                              className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-[0.58rem] font-black uppercase text-rose-300 cursor-pointer"
                            >
                              Stop
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAudioSource(src.id, {
                                muted: !src.muted,
                              })
                            }
                            className={`p-1 rounded border cursor-pointer ${
                              src.muted
                                ? "bg-rose-600/30 border-rose-500/60 text-rose-300"
                                : "bg-slate-800 border-slate-700 text-emerald-400"
                            }`}
                            title={src.muted ? "Unmute Audio" : "Mute Audio"}
                          >
                            {src.muted ? (
                              <VolumeX className="h-3 w-3" />
                            ) : (
                              <Volume2 className="h-3 w-3" />
                            )}
                          </button>

                          {audioSources.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAudioSource(src.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                              title="Remove audio source"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {src.kind === "mic_input" ? (
                        <select
                          value={src.deviceId || ""}
                          onChange={(e) => {
                            const nextDeviceId = e.target.value;
                            handleUpdateAudioSource(src.id, {
                              deviceId: nextDeviceId,
                            });
                            if (src.isActive) {
                              startAudioSource({
                                ...src,
                                deviceId: nextDeviceId,
                              });
                            }
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[0.62rem] font-bold text-slate-200"
                        >
                          <option value="">Default Microphone / Audio Input</option>
                          {audioDevices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                              {d.label || `Microphone #${i + 1}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center justify-between text-[0.6rem] text-slate-400">
                          <span className="truncate max-w-[150px]">
                            🎵 {src.fileName || "Audio Track"}
                          </span>
                          <label className="inline-flex items-center gap-1 font-bold text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(src.loop)}
                              onChange={(e) =>
                                handleUpdateAudioSource(src.id, {
                                  loop: e.target.checked,
                                })
                              }
                              className="h-3 w-3 rounded accent-purple-500"
                            />
                            <span>Loop</span>
                          </label>
                        </div>
                      )}

                      {/* Volume Slider + Live VU Meter */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.58rem] font-mono font-bold text-slate-400 w-9">
                            {Math.round(src.volume * 100)}%
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={src.volume}
                            onChange={(e) =>
                              handleUpdateAudioSource(src.id, {
                                volume: Number(e.target.value),
                              })
                            }
                            className="flex-1 h-1.5 accent-emerald-500 cursor-pointer"
                          />
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-75 ${
                              levelPct > 85
                                ? "bg-rose-500"
                                : levelPct > 60
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${src.muted ? 0 : levelPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* DOCK 3: SCOREBUG OVERLAY & GRAPHICS */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-[#131926] overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-emerald-400" />
              3. Scorebug &amp; Overlay
            </span>
          </div>

          <div className="p-3 space-y-3 text-xs overflow-y-auto max-h-96">
            <div className="space-y-1">
              <label className="text-[0.65rem] font-black uppercase text-slate-400">
                Scoreboard Position (with Team Logos):
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScorebugPosition("bottom_bar")}
                  className={`rounded-lg py-1.5 px-1 text-[0.64rem] font-black uppercase border cursor-pointer ${
                    scorebugPosition === "bottom_bar"
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  Bottom Center
                </button>
                <button
                  type="button"
                  onClick={() => setScorebugPosition("bottom_left")}
                  className={`rounded-lg py-1.5 px-1 text-[0.64rem] font-black uppercase border cursor-pointer ${
                    scorebugPosition === "bottom_left"
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  Bottom-Left Bug
                </button>
                <button
                  type="button"
                  onClick={() => setScorebugPosition("top_corner")}
                  className={`rounded-lg py-1.5 px-1 text-[0.64rem] font-black uppercase border cursor-pointer ${
                    scorebugPosition === "top_corner"
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  Top-Left Bug
                </button>
              </div>
            </div>

            {/* Active Team Logos & Scorebug Initials/First-Word Preview + Quick Initials Editor */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {homeTeam?.imageUrl ? (
                    <img
                      src={homeTeam.imageUrl}
                      alt={homeTeam.name}
                      className="h-5 w-5 rounded-full object-cover border border-rose-500/50 shrink-0"
                    />
                  ) : (
                    <span className="h-5 w-5 rounded-full bg-rose-600 text-white text-[0.55rem] font-black flex items-center justify-center shrink-0">
                      {homeScorebugName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[0.65rem] font-black text-slate-100 truncate">
                    {homeScorebugName}
                  </span>
                </div>
                <span className="text-[0.56rem] font-black text-emerald-400 uppercase shrink-0">
                  Scorebug Initials
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[0.65rem] font-black text-slate-100 truncate">
                    {awayScorebugName}
                  </span>
                  {awayTeam?.imageUrl ? (
                    <img
                      src={awayTeam.imageUrl}
                      alt={awayTeam.name}
                      className="h-5 w-5 rounded-full object-cover border border-blue-500/50 shrink-0"
                    />
                  ) : (
                    <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[0.55rem] font-black flex items-center justify-center shrink-0">
                      {awayScorebugName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Inline Edit Team Initials (Away & Home) */}
              {(awayTeam || homeTeam) && (
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                  <div className="space-y-0.5">
                    <label className="block text-[0.55rem] font-bold uppercase text-slate-400 truncate">
                      Away Initials ({awayTeam?.name || "Away"}):
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={awayTeam?.initials || ""}
                      disabled={!awayTeam}
                      onChange={(e) => {
                        if (!awayTeam) return;
                        void updateTeamInLeague(awayTeam.id, {
                          ...awayTeam,
                          initials: e.target.value.toUpperCase(),
                        });
                      }}
                      placeholder={getScorebugTeamDisplay({ name: awayTeam?.name }, "AWAY")}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="block text-[0.55rem] font-bold uppercase text-slate-400 truncate">
                      Home Initials ({homeTeam?.name || "Home"}):
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={homeTeam?.initials || ""}
                      disabled={!homeTeam}
                      onChange={(e) => {
                        if (!homeTeam) return;
                        void updateTeamInLeague(homeTeam.id, {
                          ...homeTeam,
                          initials: e.target.value.toUpperCase(),
                        });
                      }}
                      placeholder={getScorebugTeamDisplay({ name: homeTeam?.name }, "HOME")}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Timeout & Penalty Controls for Scorebug */}
              <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-800/80 text-[0.6rem]">
                {/* Away Team Timeout & Penalty */}
                <div className="rounded bg-slate-950/80 border border-slate-800 p-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-300 truncate">
                      {awayScorebugName} TO: {awayTimeoutsRemaining}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setManualAwayTimeouts(Math.max(0, awayTimeoutsRemaining - 1))
                        }
                        className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 font-black text-slate-200 cursor-pointer"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setManualAwayTimeouts(Math.min(5, awayTimeoutsRemaining + 1))
                        }
                        className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 font-black text-slate-200 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualAwayPenaltyOverride(!isAwayInPenalty)}
                    className={`w-full rounded py-0.5 font-black uppercase border cursor-pointer ${
                      isAwayInPenalty
                        ? "bg-rose-600 border-rose-400 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                    }`}
                  >
                    {isAwayInPenalty ? "● PENALTY ON" : "Penalty Off"}
                  </button>
                </div>

                {/* Home Team Timeout & Penalty */}
                <div className="rounded bg-slate-950/80 border border-slate-800 p-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-300 truncate">
                      {homeScorebugName} TO: {homeTimeoutsRemaining}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setManualHomeTimeouts(Math.max(0, homeTimeoutsRemaining - 1))
                        }
                        className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 font-black text-slate-200 cursor-pointer"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setManualHomeTimeouts(Math.min(5, homeTimeoutsRemaining + 1))
                        }
                        className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 font-black text-slate-200 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualHomePenaltyOverride(!isHomeInPenalty)}
                    className={`w-full rounded py-0.5 font-black uppercase border cursor-pointer ${
                      isHomeInPenalty
                        ? "bg-rose-600 border-rose-400 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                    }`}
                  >
                    {isHomeInPenalty ? "● PENALTY ON" : "Penalty Off"}
                  </button>
                </div>
              </div>
            </div>

            {/* Transition Stinger Logo Upload & Test Control */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] font-black uppercase text-amber-300">
                  ✨ Transition Effect Logo (League / Custom)
                </span>
                {effectiveTransitionLogoUrl && (
                  <img
                    src={effectiveTransitionLogoUrl}
                    alt="Transition Logo"
                    className="h-6 w-6 rounded-full object-contain bg-slate-900 border border-amber-400/50 p-0.5"
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <label className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1.5 text-[0.62rem] font-black uppercase text-amber-200 cursor-pointer">
                  <span>Upload Transition Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadTransitionLogo}
                    className="hidden"
                  />
                </label>
                {customTransitionLogoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTransitionLogoUrl("");
                      try {
                        window.localStorage.removeItem(
                          "boxscore_studio_transition_logo"
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2 py-1.5 text-[0.6rem] font-bold text-slate-300 cursor-pointer"
                    title="Reset to League Logo"
                  >
                    Use League Logo
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogoTransitionToLive}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1.5 text-[0.62rem] font-black uppercase text-slate-950 cursor-pointer"
                >
                  Test Wipe
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[0.65rem] font-black uppercase text-slate-400">
                Broadcast Theme:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScorebugTheme("broadcast_dark")}
                  className={`rounded-lg py-1.5 text-[0.68rem] font-black uppercase border cursor-pointer ${
                    scorebugTheme === "broadcast_dark"
                      ? "bg-blue-600 border-blue-400 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  ESPN Dark Pro
                </button>
                <button
                  type="button"
                  onClick={() => setScorebugTheme("clean_light")}
                  className={`rounded-lg py-1.5 text-[0.68rem] font-black uppercase border cursor-pointer ${
                    scorebugTheme === "clean_light"
                      ? "bg-blue-600 border-blue-400 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  Clean White
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="flex items-center justify-between font-bold text-slate-300 cursor-pointer">
                <span>Show 24s Shot Clock</span>
                <input
                  type="checkbox"
                  checked={showShotClock}
                  onChange={(e) => setShowShotClock(e.target.checked)}
                  className="h-4 w-4 rounded accent-rose-600"
                />
              </label>

              <label className="flex items-center justify-between font-bold text-slate-300 cursor-pointer">
                <span>Show Live Watermark</span>
                <input
                  type="checkbox"
                  checked={showSponsorTag}
                  onChange={(e) => setShowSponsorTag(e.target.checked)}
                  className="h-4 w-4 rounded accent-rose-600"
                />
              </label>

              {showSponsorTag && (
                <input
                  type="text"
                  value={sponsorText}
                  onChange={(e) => setSponsorText(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white"
                  placeholder="LIVE ON FACEBOOK / YOUTUBE"
                />
              )}
            </div>
          </div>
        </div>

        {/* DOCK 4: FACEBOOK PAGE / YOUTUBE LIVE STREAM & RECORD STORAGE */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-[#131926] overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-blue-400" />
              4. Facebook Live &amp; Storage
            </span>
            <button
              type="button"
              onClick={() => setShowFbSetupModal(true)}
              className="rounded bg-blue-600/20 border border-blue-500/40 px-2 py-0.5 text-[0.6rem] font-black uppercase text-blue-300 hover:bg-blue-600 hover:text-white cursor-pointer"
            >
              Setup Guide
            </button>
          </div>

          <div className="p-3 space-y-2.5 text-xs overflow-y-auto max-h-80">
            {/* Direct Facebook Page / YouTube Live Stream Key Box */}
            <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.68rem] font-black uppercase text-blue-300">
                  Direct Stream Output (RTMPS)
                </span>
                <div className="flex gap-1">
                  {(["facebook", "youtube"] as StreamPlatform[]).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => handleSelectStreamPlatform(plat)}
                      className={`rounded px-2 py-0.5 text-[0.6rem] font-black uppercase cursor-pointer ${
                        streamPlatform === plat
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {plat === "facebook" ? "Facebook Page" : "YouTube"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[0.6rem] font-bold uppercase text-slate-400">
                  {streamPlatform === "facebook"
                    ? "Facebook Live Producer Stream Key (FB-...):"
                    : "YouTube Stream Key:"}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type={showStreamKey ? "text" : "password"}
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="Paste Stream Key (e.g. FB-1770291985...)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStreamKey((v) => !v)}
                    className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2 py-1.5 text-[0.62rem] font-bold text-slate-300 cursor-pointer"
                  >
                    {showStreamKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {streamError && (
                <div className="rounded-lg bg-rose-950/70 border border-rose-500/50 px-2.5 py-1.5 text-[0.65rem] font-bold text-rose-200">
                  ⚠️ {streamError}
                </div>
              )}

              {!isStreamingLive ? (
                <button
                  type="button"
                  disabled={isConnectingStream}
                  onClick={startRtmpLiveStream}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>
                    {isConnectingStream
                      ? "Connecting to Facebook Live..."
                      : `Connect & Stream to ${streamPlatform === "facebook" ? "Facebook Live" : "YouTube"}`}
                  </span>
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-emerald-950/70 border border-emerald-500/50 px-2.5 py-1.5 text-[0.65rem]">
                    <span className="font-black text-emerald-300 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      STREAMING LIVE ({formatClock(streamDurationSec)})
                    </span>
                    <span className="font-mono text-emerald-200">
                      {streamFramesSent} frames • {(streamBytesSent / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={stopRtmpLiveStream}
                    className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white cursor-pointer"
                  >
                    Stop Live Stream
                  </button>
                </div>
              )}
            </div>

            <label className="block text-[0.65rem] font-black uppercase text-slate-400 pt-1">
              Where to Save Recorded Video:
            </label>

            {[
              {
                id: "browser_indexeddb",
                title: "In-App Timeline DB",
                desc: "Instant access on bottom timeline for slow-mo replays.",
              },
              {
                id: "local_filesystem",
                title: "Computer Folder Picker",
                desc: "Choose any folder/drive on your computer + keep in timeline.",
              },
              {
                id: "download_prompt",
                title: "Browser Downloads Folder",
                desc: "Auto-downloads .webm file on stop + keeps in timeline.",
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-2 rounded-xl border p-2 cursor-pointer ${
                  storageLocation === opt.id
                    ? "bg-rose-950/30 border-rose-500/60"
                    : "bg-slate-900 border-slate-800"
                }`}
              >
                <input
                  type="radio"
                  name="storage_loc"
                  checked={storageLocation === opt.id}
                  onChange={() => setStorageLocation(opt.id as StorageLocation)}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <p className="text-xs font-black text-white">{opt.title}</p>
                  <p className="text-[0.62rem] text-slate-400">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. FACEBOOK PAGE LIVE PRODUCER SETUP MODAL
         ===================================================================== */}
      {showFbSetupModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowFbSetupModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-blue-500/40 bg-[#131926] p-5 shadow-2xl space-y-4 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-black">
                  f
                </span>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    Go Live on Your Facebook Page
                  </h2>
                  <p className="text-xs text-slate-400">
                    Connect Box Score OBS Studio directly to Facebook Live Producer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFbSetupModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Step-by-Step Instructions matching user's Facebook Live Producer screenshot */}
            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 space-y-2.5 text-xs">
              <p className="font-black uppercase text-amber-400 text-[0.68rem]">
                How to Connect Your Facebook Page (3 Quick Steps):
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed">
                <li>
                  In your <strong>Facebook Live Producer</strong> tab (left sidebar under{" "}
                  <span className="text-white font-bold">&ldquo;Choose where to post&rdquo;</span>),
                  switch from <em>Post on profile</em> to{" "}
                  <span className="text-blue-400 font-bold">&ldquo;Post to a Page you manage&rdquo;</span>{" "}
                  and select your Facebook Page.
                </li>
                <li>
                  Keep <span className="text-blue-400 font-bold">&ldquo;Streaming software&rdquo;</span>{" "}
                  selected, click the blue <strong>Copy</strong> button next to{" "}
                  <strong>Stream key</strong> (starts with <code className="text-amber-300">FB-1770...</code>),
                  and paste it below.
                </li>
                <li>
                  Click <strong>&ldquo;Connect &amp; Stream to Facebook Live&rdquo;</strong> below.
                  Within ~3 seconds, your Right Live Program monitor (with Scorebug, cameras &amp; slow-mo replays) will appear inside Facebook&apos;s video preview — then click{" "}
                  <strong className="text-blue-400">&ldquo;Go live&rdquo;</strong> on Facebook!
                </li>
              </ol>
            </div>

            {/* Platform & Server URL */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "facebook", label: "Facebook Page / Live" },
                    { id: "youtube", label: "YouTube Live" },
                    { id: "custom", label: "Custom RTMP" },
                  ] as { id: StreamPlatform; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectStreamPlatform(p.id)}
                    className={`rounded-xl py-2 text-xs font-black uppercase border cursor-pointer ${
                      streamPlatform === p.id
                        ? "bg-blue-600 border-blue-400 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[0.65rem] font-black uppercase text-slate-400 mb-1">
                  Server URL (RTMPS):
                </label>
                <input
                  type="text"
                  value={rtmpServerUrl}
                  onChange={(e) => setRtmpServerUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[0.65rem] font-black uppercase text-amber-400 mb-1">
                  Paste Your Facebook Stream Key (`FB-...`):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showStreamKey ? "text" : "password"}
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="FB-1770291985106628-0-Ab7g4J4HS0g..."
                    className="flex-1 rounded-xl border border-blue-500/60 bg-slate-950 px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowStreamKey((v) => !v)}
                    className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2.5 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    {showStreamKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {streamError && (
                <div className="rounded-xl bg-rose-950/80 border border-rose-500 px-3 py-2 text-xs font-bold text-rose-200">
                  ⚠️ {streamError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={openCleanProgramWindow}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <Tv className="h-4 w-4 text-sky-400" />
                  <span>Or Pop-Out Clean 16:9 Window</span>
                </button>

                {!isStreamingLive ? (
                  <button
                    type="button"
                    disabled={isConnectingStream}
                    onClick={async () => {
                      await startRtmpLiveStream();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg cursor-pointer"
                  >
                    <Radio className="h-4 w-4" />
                    <span>
                      {isConnectingStream
                        ? "Connecting to Facebook RTMPS..."
                        : "Connect & Stream to Facebook Live"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRtmpLiveStream}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg cursor-pointer"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    <span>Stop Streaming ({formatClock(streamDurationSec)})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. PAIR & SAVE IPHONE / ANDROID WIRELESS CAMERA MODAL (QR + LINK + IP CAM + MULTI-SCENE)
         ===================================================================== */}
      {pairingWirelessSlot &&
        (() => {
          const targetScene = scenes.find(
            (s) => s.id === pairingWirelessSlot.sceneId
          );
          const targetSlot = targetScene?.cameras.find(
            (c) => c.id === pairingWirelessSlot.slotId
          );
          if (!targetScene || !targetSlot) return null;

          const roomCode = (
            targetSlot.wirelessRoomCode ||
            `CAM${targetSlot.id.slice(-4).toUpperCase()}`
          )
            .trim()
            .toUpperCase();
          const targetPlatform: WirelessDevicePlatform =
            targetSlot.wirelessPlatform ||
            (targetSlot.angleName.toLowerCase().includes("android")
              ? "android"
              : "iphone");
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
          const mobileCamUrl = `${origin}/studio/mobile-cam?room=${encodeURIComponent(
            roomCode
          )}&name=${encodeURIComponent(
            targetSlot.angleName || targetSlot.label
          )}&platform=${encodeURIComponent(targetPlatform)}`;
          const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
            mobileCamUrl
          )}`;
          const status =
            wirelessStatusByRoom[roomCode] ||
            wirelessStatusBySlot[targetSlot.id] ||
            "waiting";
          const existingSavedCam = savedWirelessCameras.find(
            (w) =>
              (targetSlot.savedWirelessCamId &&
                w.id === targetSlot.savedWirelessCamId) ||
              w.roomCode.toUpperCase() === roomCode
          );
          const cameraScenesList = scenes.filter(
            (s) => s.kind === "camera_scene"
          );

          return (
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
              onClick={() => setPairingWirelessSlot(null)}
            >
              <div
                className="w-full max-w-xl rounded-2xl border border-sky-500/40 bg-[#131926] p-5 shadow-2xl space-y-3.5 text-slate-100 my-auto max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400">
                      <Smartphone className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-wider text-white">
                        Pair &amp; Save iPhone or Android Wireless Camera
                      </h2>
                      <p className="text-xs text-slate-400">
                        Scan QR code once, save camera, and reuse it across any Scene
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPairingWirelessSlot(null)}
                    className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300 cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Device Type (iPhone / Android), Camera Name & Room Code + SAVE BUTTON */}
                <div className="rounded-xl border border-sky-500/30 bg-slate-900/90 p-3 space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-4">
                      <label className="block text-[0.6rem] font-black uppercase text-slate-400 mb-1">
                        Phone Type:
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCameraSlot(
                              targetScene.id,
                              targetSlot.id,
                              { wirelessPlatform: "iphone" }
                            )
                          }
                          className={`rounded-lg py-1.5 px-2 text-[0.62rem] font-black uppercase border cursor-pointer ${
                            targetPlatform === "iphone"
                              ? "bg-sky-600 border-sky-400 text-white"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          🍎 iPhone
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCameraSlot(
                              targetScene.id,
                              targetSlot.id,
                              { wirelessPlatform: "android" }
                            )
                          }
                          className={`rounded-lg py-1.5 px-2 text-[0.62rem] font-black uppercase border cursor-pointer ${
                            targetPlatform === "android"
                              ? "bg-emerald-600 border-emerald-400 text-white"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          🤖 Android
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[0.6rem] font-black uppercase text-slate-400 mb-1">
                        Camera Label / Name:
                      </label>
                      <input
                        type="text"
                        value={targetSlot.angleName}
                        onChange={(e) =>
                          handleUpdateCameraSlot(
                            targetScene.id,
                            targetSlot.id,
                            {
                              angleName: e.target.value,
                              label: e.target.value,
                            }
                          )
                        }
                        placeholder={
                          targetPlatform === "android"
                            ? "Android Baseline Cam"
                            : "iPhone Center Court"
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[0.6rem] font-black uppercase text-slate-400 mb-1">
                        Room Code:
                      </label>
                      <input
                        type="text"
                        value={roomCode}
                        onChange={(e) => {
                          const nextCode = e.target.value.toUpperCase();
                          handleUpdateCameraSlot(
                            targetScene.id,
                            targetSlot.id,
                            { wirelessRoomCode: nextCode }
                          );
                          if (nextCode.trim().length >= 3) {
                            connectWirelessPhoneSlot({
                              ...targetSlot,
                              wirelessRoomCode: nextCode,
                            });
                          }
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-black uppercase tracking-wider text-amber-300 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[0.62rem] text-slate-400">
                      {existingSavedCam
                        ? `✓ Saved as "${existingSavedCam.name}" (${existingSavedCam.roomCode}) — available in all Scenes`
                        : "Save this wireless camera to quickly select or add it in other Scenes:"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveWirelessCameraFromSlot(
                          targetSlot,
                          targetPlatform
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>
                        {existingSavedCam
                          ? "Update Saved Wireless Camera"
                          : "Save Wireless Camera for All Scenes"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Quick-Select Previously Saved Wireless Cameras */}
                {savedWirelessCameras.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 space-y-1.5 text-xs">
                    <span className="block text-[0.6rem] font-black uppercase text-sky-300">
                      📲 Saved iPhone &amp; Android Cameras (Click to Load into This Slot):
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {savedWirelessCameras.map((wc) => {
                        const isSelected =
                          wc.roomCode.toUpperCase() === roomCode;
                        const wcStatus =
                          wirelessStatusByRoom[wc.roomCode.toUpperCase()];
                        const isLive =
                          wcStatus === "webrtc" ||
                          wcStatus === "relay" ||
                          wcStatus === "ip";
                        return (
                          <button
                            key={wc.id}
                            type="button"
                            onClick={() =>
                              handleUseSavedWirelessCameraInScene(
                                wc,
                                targetScene.id,
                                targetSlot.id
                              )
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.62rem] font-black border cursor-pointer transition-all ${
                              isSelected
                                ? "bg-sky-600 border-sky-400 text-white shadow"
                                : "bg-slate-950 border-slate-700 text-slate-200 hover:border-sky-400"
                            }`}
                          >
                            <span>
                              {wc.platform === "android" ? "🤖" : "🍎"}{" "}
                              {wc.name}
                            </span>
                            <span className="font-mono text-[0.55rem] text-amber-300">
                              ({wc.roomCode})
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isLive ? "bg-emerald-400" : "bg-amber-400"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* QR Code + Room Code Card */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                  <div className="sm:col-span-2 flex flex-col items-center justify-center">
                    <div className="rounded-xl bg-white p-2 shadow-lg">
                      <img
                        src={qrImageUrl}
                        alt="Scan QR Code with iPhone or Android"
                        className="h-36 w-36 object-contain"
                      />
                    </div>
                    <span className="mt-2 text-[0.62rem] font-black uppercase text-amber-300">
                      Room Code: {roomCode}
                    </span>
                  </div>

                  <div className="sm:col-span-3 space-y-2.5 text-xs">
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1">
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-black uppercase text-[0.65rem]">
                        {status === "webrtc"
                          ? "🟢 Phone Connected (WebRTC HD)"
                          : status === "relay"
                          ? "🟢 Phone Connected (Live Stream)"
                          : status === "ip"
                          ? "🟢 Connected via IP Camera URL"
                          : "🟡 Waiting for Phone to Scan QR..."}
                      </span>
                    </div>

                    <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[0.7rem] leading-relaxed">
                      <li>
                        Open the Camera app on your <strong>iPhone (Safari)</strong> or{" "}
                        <strong>Android (Chrome)</strong> and scan this QR code.
                      </li>
                      <li>
                        Tap <strong>&ldquo;Start Wireless Camera&rdquo;</strong> on your phone and allow Camera access.
                      </li>
                      <li>
                        Click <strong>&ldquo;Save Wireless Camera for All Scenes&rdquo;</strong> above to use{" "}
                        <strong className="text-sky-300">{targetSlot.angleName}</strong> in any Scene!
                      </li>
                    </ol>

                    <div className="pt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={mobileCamUrl}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[0.65rem] font-mono text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyText(mobileCamUrl, "wireless_url")}
                        className="rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-[0.65rem] font-black uppercase text-white cursor-pointer shrink-0 flex items-center gap-1"
                      >
                        {copiedKey === "wireless_url" ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* One-Click Apply to Other Scenes */}
                {cameraScenesList.length > 1 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.62rem] font-black uppercase text-emerald-300">
                        🎬 Use This Wireless Camera in Other Scenes:
                      </span>
                      <span className="text-[0.58rem] text-slate-400">
                        Shares live feed across scenes without re-pairing
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cameraScenesList.map((sc) => {
                        const isInScene = sc.cameras.some(
                          (c) =>
                            c.sourceType === "wireless_phone" &&
                            (c.wirelessRoomCode || "")
                              .trim()
                              .toUpperCase() === roomCode
                        );
                        return (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() => {
                              const camObj: SavedWirelessCamera =
                                existingSavedCam || {
                                  id:
                                    targetSlot.savedWirelessCamId ||
                                    `wcam-${generateUUID().slice(0, 8)}`,
                                  name:
                                    targetSlot.angleName ||
                                    targetSlot.label ||
                                    "Wireless Phone Cam",
                                  platform: targetPlatform,
                                  roomCode,
                                  ipUrl: targetSlot.wirelessIpUrl || undefined,
                                  createdAt: new Date().toISOString(),
                                };
                              if (!existingSavedCam) {
                                handleSaveWirelessCameraFromSlot(
                                  targetSlot,
                                  targetPlatform
                                );
                              }
                              handleUseSavedWirelessCameraInScene(
                                camObj,
                                sc.id
                              );
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.6rem] font-black uppercase border cursor-pointer transition-colors ${
                              isInScene
                                ? "bg-emerald-600/25 border-emerald-500/50 text-emerald-300"
                                : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:border-emerald-400"
                            }`}
                          >
                            <span>
                              {isInScene ? "✓ In" : "+ Use in"} {sc.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Optional: Direct IP Webcam MJPEG URL (DroidCam / IP Webcam App) */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
                  <label className="block text-[0.62rem] font-black uppercase text-slate-400">
                    Optional: Or Paste Android/iOS IP Webcam Stream URL (e.g. http://192.168.1.50:8080/video):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={targetSlot.wirelessIpUrl || ""}
                      onChange={(e) => {
                        handleUpdateCameraSlot(targetScene.id, targetSlot.id, {
                          wirelessIpUrl: e.target.value,
                        });
                      }}
                      placeholder="http://192.168.1.50:8080/video (Leave blank for QR WebRTC)"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
                    />
                    <button
                      type="button"
                      onClick={() => connectWirelessPhoneSlot(targetSlot, true)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-black uppercase text-white cursor-pointer shrink-0"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

export default function BroadcastStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-3">
          <BoxScoreLogo size="md" variant="dark-bg" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Loading OBS Studio Mode...
          </p>
        </div>
      }
    >
      <LiveBroadcastStudioContent />
    </Suspense>
  );
}
