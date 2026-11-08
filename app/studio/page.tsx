"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  Camera,
  Check,
  Circle,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
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
  Moon,
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
  Sun,
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
import {
  RTC_CONFIG,
  addIceCandidateSafely,
  flushBufferedIceCandidates,
} from "@/lib/webrtc-config";

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
  showGameClock?: boolean;
  cameraId?: string;
  cameraLabel?: string;
}

export type AdOverlayLayout =
  | "bottom_right_card"
  | "top_right_card"
  | "bottom_center_banner"
  | "top_left_card"
  | "fullscreen_commercial";

export interface StudioAdItem {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface StudioCameraTrackInfo {
  cameraId: string;
  label: string;
  angleName: string;
  sourceType: SceneCameraSlot["sourceType"] | "clean_program";
  slot?: SceneCameraSlot;
}

function getBroadcastOrdinalPeriodLabel(period: number, maxRegularPeriods = 4): string {
  if (period <= maxRegularPeriods) {
    if (maxRegularPeriods === 2) return period === 1 ? "1ST HALF" : "2ND HALF";
    if (period === 1) return "1ST";
    if (period === 2) return "2ND";
    if (period === 3) return "3RD";
    return `${period}TH`;
  }
  const otIndex = period - maxRegularPeriods;
  return otIndex === 1 ? "OT" : `${otIndex}OT`;
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
    setupRealtimeSubscriptions,
    syncFromLocalStorage,
    updateTeamInLeague,
    updateMatchDetailsInLeague,
    saveGameSession,
    persistLeagueGamesToCloud,
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

  // Custom / League Logo Transition (Stinger Wipe) State, Design & Duration
  const [customTransitionLogoUrl, setCustomTransitionLogoUrl] = useState<string>("");
  const [transitionDurationMs, setTransitionDurationMs] = useState<number>(850);
  const [selectedTransitionDesign, setSelectedTransitionDesign] = useState<
    "slash_wipe" | "split_doors" | "diamond_burst"
  >("slash_wipe");
  const transitionLogoImgRef = useRef<HTMLImageElement | null>(null);
  const stingerStateRef = useRef<{
    active: boolean;
    startMs: number;
    durationMs: number;
    switchedScene: boolean;
    targetSceneId: string;
    design: "slash_wipe" | "split_doors" | "diamond_burst" | "curtain_wipe";
  }>({
    active: false,
    startMs: 0,
    durationMs: 850,
    switchedScene: false,
    targetSceneId: "",
    design: "slash_wipe",
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
  const pendingIceCandidatesByRoomRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
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

  // Team Comparison Stats Overlay State (Full Card or Single-Stat Comparison like FG, REB, etc.)
  const [showTeamComparisonOverlay, setShowTeamComparisonOverlay] = useState<boolean>(false);
  const [teamComparisonStatKey, setTeamComparisonStatKey] = useState<
    "ALL" | "FG" | "3PT" | "FT" | "REB" | "AST" | "STL" | "BLK" | "TOV" | "PF"
  >("ALL");

  // Top Performer Per Team Broadcast Layer State
  const [showTopPerformersOverlay, setShowTopPerformersOverlay] = useState<boolean>(false);
  const [topPerformerCriterion, setTopPerformerCriterion] = useState<
    "OVERALL" | "PTS" | "REB" | "AST"
  >("OVERALL");
  const [manualAwayTopPerformerId, setManualAwayTopPerformerId] = useState<string>("");
  const [manualHomeTopPerformerId, setManualHomeTopPerformerId] = useState<string>("");

  // Multiple Advertisement Images & Broadcast Ad Overlay State
  const [adItems, setAdItems] = useState<StudioAdItem[]>([]);
  const [activeAdId, setActiveAdId] = useState<string>("");
  const [showAdOverlay, setShowAdOverlay] = useState<boolean>(false);
  const [adOverlayLayout, setAdOverlayLayout] = useState<AdOverlayLayout>("bottom_right_card");
  const [autoRotateAds, setAutoRotateAds] = useState<boolean>(false);
  const adImgCacheRef = useRef<Record<string, HTMLImageElement>>({});

  // Replay Game Clock Option (Buzzer Beater Timer Check on Raw Camera Replay) & Multi-Camera Timeline State
  const [showReplayGameClock, setShowReplayGameClock] = useState<boolean>(true);
  const [selectedTimelineCameraKey, setSelectedTimelineCameraKey] = useState<string>("clean_program");
  const [liveRecordingFramesByCam, setLiveRecordingFramesByCam] = useState<
    Record<string, TimelineFrame[]>
  >({});
  const [rollingTimelineFramesByCam, setRollingTimelineFramesByCam] = useState<
    Record<string, TimelineFrame[]>
  >({});

  // Team Logo & Featured Player / Top Performers Image Refs for Canvas Rendering
  const homeLogoImgRef = useRef<HTMLImageElement | null>(null);
  const awayLogoImgRef = useRef<HTMLImageElement | null>(null);
  const featuredPlayerImgRef = useRef<HTMLImageElement | null>(null);
  const awayTopPerformerImgRef = useRef<HTMLImageElement | null>(null);
  const homeTopPerformerImgRef = useRef<HTMLImageElement | null>(null);
  const mediaImageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  // Offscreen DOM container for camera/WebRTC <video> elements + HTTP signaling poll refs
  const hiddenVideosContainerRef = useRef<HTMLDivElement | null>(null);
  const wirelessHttpPollByRoomRef = useRef<Record<string, NodeJS.Timeout>>({});
  const wirelessHandledOfferTsByRoomRef = useRef<Record<string, number>>({});

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
  const [fbLivePublicUrl, setFbLivePublicUrl] = useState<string>("");
  const [streamSavedNotice, setStreamSavedNotice] = useState<string | null>(null);
  const [streamQualityPreset, setStreamQualityPreset] = useState<"360p" | "540p" | "720p">("540p");
  const [autoAdaptQuality, setAutoAdaptQuality] = useState<boolean>(true);
  const [showStreamHealthDetails, setShowStreamHealthDetails] = useState<boolean>(true);
  const [isTestingStreamHealth, setIsTestingStreamHealth] = useState<boolean>(false);
  const [streamHealth, setStreamHealth] = useState<{
    overallStatus: "healthy" | "warning" | "critical" | "idle";
    overallScore: number;
    internetStatus: "ok" | "slow" | "critical";
    pingLatencyMs: number;
    uploadBitrateKbps: number;
    targetBitrateKbps: number;
    downlinkMbps: number | null;
    networkType: string;
    networkStallsCount: number;
    reconnectionsCount: number;
    internetDiagnosis: string;
    computerStatus: "ok" | "high_load" | "overloaded";
    encodingFps: number;
    targetFps: number;
    encoderQueueSize: number;
    cpuDroppedFrames: number;
    cpuCores: number;
    deviceMemoryGb: number | null;
    computerDiagnosis: string;
    videoSyncStatus: "synced" | "resyncing" | "waiting_keyframe";
    keyframesSent: number;
    lastKeyframeAgoSec: number;
    greenScreenDiagnosis: string;
    activeIssues: string[];
  }>({
    overallStatus: "idle",
    overallScore: 100,
    internetStatus: "ok",
    pingLatencyMs: 0,
    uploadBitrateKbps: 0,
    targetBitrateKbps: 1000,
    downlinkMbps: null,
    networkType: "broadband",
    networkStallsCount: 0,
    reconnectionsCount: 0,
    internetDiagnosis: "Ready to test or start livestream.",
    computerStatus: "ok",
    encodingFps: 24,
    targetFps: 24,
    encoderQueueSize: 0,
    cpuDroppedFrames: 0,
    cpuCores: 4,
    deviceMemoryGb: null,
    computerDiagnosis: "Hardware WebCodecs H.264 encoder ready.",
    videoSyncStatus: "synced",
    keyframesSent: 0,
    lastKeyframeAgoSec: 0,
    greenScreenDiagnosis:
      "Strict IDR Keyframe & SPS/PPS Color Guard enabled — prevents green screen on slow connections.",
    activeIssues: [],
  });

  // Section Ordering (Camera Timeline vs Scenes and Live), Visibility & Theme Mode
  const [topSection, setTopSection] = useState<"timeline" | "scenes_and_live">("timeline");
  const [showTimeline, setShowTimeline] = useState<boolean>(true);
  const [showScenesAndLive, setShowScenesAndLive] = useState<boolean>(true);
  const [showPreviewScenesStrip, setShowPreviewScenesStrip] = useState<boolean>(true);
  const [studioTheme, setStudioTheme] = useState<"dark" | "light">("dark");

  // Canvas & Video Refs (including Clean Raw Program Canvas & Per-Camera Raw Canvases for Scorebug-Free Recording)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanLiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRawCanvasByKeyRef = useRef<Record<string, HTMLCanvasElement>>({});
  const sceneThumbCanvasByIdRef = useRef<Record<string, HTMLCanvasElement | null>>({});
  const previewReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewMediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveMediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrubVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const cameraMediaRecordersRef = useRef<Record<string, MediaRecorder>>({});
  const cameraRecordedChunksRef = useRef<Record<string, Blob[]>>({});
  const liveCaptureFramesByCamRef = useRef<Record<string, TimelineFrame[]>>({});
  const rollingFramesByCamRef = useRef<Record<string, TimelineFrame[]>>({});
  const rollingElapsedSecRef = useRef<number>(0);
  const replayFrameImgCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveCaptureFramesRef = useRef<TimelineFrame[]>([]);
  const liveClockTagsRef = useRef<TimelineClockTag[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const activeRecordingSessionIdRef = useRef<string>("");

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
    configure: (cfg: Record<string, unknown>) => void;
    encode: (frame: unknown, opts?: { keyFrame?: boolean }) => void;
    flush?: () => Promise<void>;
    close: () => void;
    state: string;
    encodeQueueSize?: number;
  } | null>(null);
  const encoderLoopRef = useRef<NodeJS.Timeout | null>(null);
  const flushLoopRef = useRef<NodeJS.Timeout | null>(null);
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const avcConfigBase64Ref = useRef<string | undefined>(undefined);
  const pendingRtmpFramesRef = useRef<
    Array<{ timestampMs: number; isKeyframe: boolean; dataBase64: string }>
  >([]);
  const isFlushingRtmpRef = useRef<boolean>(false);
  const forceNextKeyframeRef = useRef<boolean>(false);
  const waitingForFreshKeyframeRef = useRef<boolean>(false);
  const rtmpTelemetryRef = useRef<{
    encodedFramesInWindow: number;
    cpuDroppedFrames: number;
    networkStallsCount: number;
    reconnectionsCount: number;
    keyframesSent: number;
    lastKeyframeSentAtMs: number;
    lastPushLatencyMs: number;
    bytesSentInWindow: number;
  }>({
    encodedFramesInWindow: 0,
    cpuDroppedFrames: 0,
    networkStallsCount: 0,
    reconnectionsCount: 0,
    keyframesSent: 0,
    lastKeyframeSentAtMs: 0,
    lastPushLatencyMs: 0,
    bytesSentInWindow: 0,
  });
  const streamStartTimeRef = useRef<number>(0);
  const streamFrameCountRef = useRef<number>(0);
  const encoderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanPopupWindowRef = useRef<Window | null>(null);
  const cleanPopupCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Restore saved stream key & public URL from localStorage so browser refresh retains live setup
    try {
      const savedKey = localStorage.getItem("boxscore_studio_stream_key");
      if (savedKey) setStreamKey(savedKey);
      const savedUrl = localStorage.getItem("boxscore_studio_fb_live_url");
      if (savedUrl) setFbLivePublicUrl(savedUrl);
      const savedTopSection = localStorage.getItem("boxscore_studio_top_section");
      if (savedTopSection === "timeline" || savedTopSection === "scenes_and_live") {
        setTopSection(savedTopSection);
      }
      const savedShowTimeline = localStorage.getItem("boxscore_studio_show_timeline");
      if (savedShowTimeline !== null) {
        setShowTimeline(savedShowTimeline === "true");
      }
      const savedShowScenesLive = localStorage.getItem("boxscore_studio_show_scenes_live");
      if (savedShowScenesLive !== null) {
        setShowScenesAndLive(savedShowScenesLive === "true");
      }
      const savedShowPreviewStrip = localStorage.getItem("boxscore_studio_show_preview_scenes");
      if (savedShowPreviewStrip !== null) {
        setShowPreviewScenesStrip(savedShowPreviewStrip === "true");
      }
      const savedReplayClock = localStorage.getItem("boxscore_studio_replay_clock");
      if (savedReplayClock !== null) {
        setShowReplayGameClock(savedReplayClock === "true");
      }
      const rawAds = localStorage.getItem("boxscore_studio_ads");
      if (rawAds) {
        const parsedAds = JSON.parse(rawAds) as StudioAdItem[];
        if (Array.isArray(parsedAds) && parsedAds.length > 0) {
          setAdItems(parsedAds);
          setActiveAdId(parsedAds[0].id);
        }
      }
      const savedTheme =
        localStorage.getItem("boxscore_studio_theme") ||
        localStorage.getItem("color-scheme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setStudioTheme(savedTheme);
        const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
        if (meta) meta.content = savedTheme;
      }
    } catch {}

    const cleanupRealtime = setupRealtimeSubscriptions();

    let gamesBc: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        gamesBc = new BroadcastChannel("boxscore_game_sessions_sync");
        gamesBc.onmessage = () => {
          syncFromLocalStorage();
        };
      }
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("boxscore")) {
        syncFromLocalStorage();
      }
    };
    window.addEventListener("storage", handleStorage);

    const fastSyncInterval = setInterval(() => {
      syncFromLocalStorage();
    }, 200);

    return () => {
      cleanupRealtime();
      if (gamesBc) {
        try {
          gamesBc.close();
        } catch {}
      }
      clearInterval(fastSyncInterval);
      window.removeEventListener("storage", handleStorage);
    };
  }, [
    initializeSession,
    fetchLeaguesAndTeams,
    setupRealtimeSubscriptions,
    syncFromLocalStorage,
    refreshStoredVideos,
  ]);

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
  const activeMatchCategory = useMemo(() => {
    if (!activeLeague?.categories || !activeMatch?.categoryId) return null;
    return (
      activeLeague.categories.find((c) => c.id === activeMatch.categoryId) ??
      null
    );
  }, [activeLeague?.categories, activeMatch?.categoryId]);
  const bonusThreshold =
    activeMatchCategory?.rulesConfig?.teamFoulBonusThreshold ??
    activeLeague?.rulesConfig?.teamFoulBonusThreshold ??
    5;
  const homePeriodFouls =
    liveSession?.homeTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const awayPeriodFouls =
    liveSession?.awayTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const homeTimeoutsRemaining =
    liveSession?.homeTimeoutsRemaining ?? manualHomeTimeouts;
  const awayTimeoutsRemaining =
    liveSession?.awayTimeoutsRemaining ?? manualAwayTimeouts;

  // Whenever live period fouls or period change in the Scorebook, clear any stale manual override so live BONUS status always syncs automatically
  useEffect(() => {
    setManualHomePenaltyOverride(null);
  }, [homePeriodFouls, period, selectedMatchId]);

  useEffect(() => {
    setManualAwayPenaltyOverride(null);
  }, [awayPeriodFouls, period, selectedMatchId]);

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

  // Aggregated Team Comparison Stats for Broadcast Team Comparison Overlay
  const teamComparisonStats = useMemo(() => {
    const sumSide = (
      statsMap: Record<string, PlayerGameStats> | undefined,
      fallbackScore: number,
      periodFouls: number
    ) => {
      const list = statsMap ? Object.values(statsMap) : [];
      let fgm = 0,
        fga = 0,
        tpm = 0,
        tpa = 0,
        ftm = 0,
        fta = 0,
        oreb = 0,
        dreb = 0,
        ast = 0,
        stl = 0,
        blk = 0,
        tov = 0,
        pf = 0;
      for (const p of list) {
        fgm += p.fgm || 0;
        fga += p.fga || 0;
        tpm += p.tpm || 0;
        tpa += p.tpa || 0;
        ftm += p.ftm || 0;
        fta += p.fta || 0;
        oreb += p.oreb || 0;
        dreb += p.dreb || 0;
        ast += p.ast || 0;
        stl += p.stl || 0;
        blk += p.blk || 0;
        tov += p.tov || 0;
        pf += p.pf || 0;
      }
      const fgPct = fga > 0 ? Math.round((fgm / fga) * 100) : 0;
      const tpPct = tpa > 0 ? Math.round((tpm / tpa) * 100) : 0;
      const ftPct = fta > 0 ? Math.round((ftm / fta) * 100) : 0;
      return {
        pts: fallbackScore,
        fgm,
        fga,
        fgPct,
        tpm,
        tpa,
        tpPct,
        ftm,
        fta,
        ftPct,
        reb: oreb + dreb,
        oreb,
        dreb,
        ast,
        stl,
        blk,
        tov,
        fouls: Math.max(pf, periodFouls),
      };
    };

    return {
      away: sumSide(liveSession?.awayPlayerStats, awayScore, awayPeriodFouls),
      home: sumSide(liveSession?.homePlayerStats, homeScore, homePeriodFouls),
    };
  }, [
    liveSession?.awayPlayerStats,
    liveSession?.homePlayerStats,
    awayScore,
    homeScore,
    awayPeriodFouls,
    homePeriodFouls,
  ]);

  // All Roster Players with Game Stats (for Top Performer Per Team Layer)
  const allAwayPlayers = useMemo(() => {
    const statsMap = liveSession?.awayPlayerStats;
    if (statsMap && Object.keys(statsMap).length > 0) {
      return Object.values(statsMap).map((p) => ({
        ...p,
        teamSide: "AWAY" as const,
        teamName: awayTeamName,
        teamShortName: awayScorebugName,
        teamColor: awayColor,
      }));
    }
    return (awayTeam?.roster ?? []).map((r) => ({
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

  const allHomePlayers = useMemo(() => {
    const statsMap = liveSession?.homePlayerStats;
    if (statsMap && Object.keys(statsMap).length > 0) {
      return Object.values(statsMap).map((p) => ({
        ...p,
        teamSide: "HOME" as const,
        teamName: homeTeamName,
        teamShortName: homeScorebugName,
        teamColor: homeColor,
      }));
    }
    return (homeTeam?.roster ?? []).map((r) => ({
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

  const awayTopPerformer = useMemo(() => {
    if (allAwayPlayers.length === 0) return null;
    if (manualAwayTopPerformerId) {
      const manual = allAwayPlayers.find((p) => p.playerId === manualAwayTopPerformerId);
      if (manual) return manual;
    }
    const sorted = [...allAwayPlayers].sort((a, b) => {
      const aReb = (a.oreb || 0) + (a.dreb || 0);
      const bReb = (b.oreb || 0) + (b.dreb || 0);
      if (topPerformerCriterion === "PTS") {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      } else if (topPerformerCriterion === "REB") {
        if (bReb !== aReb) return bReb - aReb;
      } else if (topPerformerCriterion === "AST") {
        if ((b.ast || 0) !== (a.ast || 0)) return (b.ast || 0) - (a.ast || 0);
      }
      const aImpact =
        (a.points || 0) * 1.4 +
        aReb * 1.2 +
        (a.ast || 0) * 1.5 +
        (a.stl || 0) * 2 +
        (a.blk || 0) * 2 -
        (a.tov || 0) * 0.5;
      const bImpact =
        (b.points || 0) * 1.4 +
        bReb * 1.2 +
        (b.ast || 0) * 1.5 +
        (b.stl || 0) * 2 +
        (b.blk || 0) * 2 -
        (b.tov || 0) * 0.5;
      return bImpact - aImpact;
    });
    return sorted[0] ?? null;
  }, [allAwayPlayers, manualAwayTopPerformerId, topPerformerCriterion]);

  const homeTopPerformer = useMemo(() => {
    if (allHomePlayers.length === 0) return null;
    if (manualHomeTopPerformerId) {
      const manual = allHomePlayers.find((p) => p.playerId === manualHomeTopPerformerId);
      if (manual) return manual;
    }
    const sorted = [...allHomePlayers].sort((a, b) => {
      const aReb = (a.oreb || 0) + (a.dreb || 0);
      const bReb = (b.oreb || 0) + (b.dreb || 0);
      if (topPerformerCriterion === "PTS") {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      } else if (topPerformerCriterion === "REB") {
        if (bReb !== aReb) return bReb - aReb;
      } else if (topPerformerCriterion === "AST") {
        if ((b.ast || 0) !== (a.ast || 0)) return (b.ast || 0) - (a.ast || 0);
      }
      const aImpact =
        (a.points || 0) * 1.4 +
        aReb * 1.2 +
        (a.ast || 0) * 1.5 +
        (a.stl || 0) * 2 +
        (a.blk || 0) * 2 -
        (a.tov || 0) * 0.5;
      const bImpact =
        (b.points || 0) * 1.4 +
        bReb * 1.2 +
        (b.ast || 0) * 1.5 +
        (b.stl || 0) * 2 +
        (b.blk || 0) * 2 -
        (b.tov || 0) * 0.5;
      return bImpact - aImpact;
    });
    return sorted[0] ?? null;
  }, [allHomePlayers, manualHomeTopPerformerId, topPerformerCriterion]);

  // Load Top Performer Player Portraits into CORS-safe HTMLImageElements
  useEffect(() => {
    const rawUrl = awayTopPerformer?.imageUrl;
    if (!rawUrl || !rawUrl.trim()) {
      awayTopPerformerImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    const trimmed = rawUrl.trim();
    img.src =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? `/api/image-proxy?url=${encodeURIComponent(trimmed)}`
        : trimmed;
    awayTopPerformerImgRef.current = img;
  }, [awayTopPerformer?.imageUrl]);

  useEffect(() => {
    const rawUrl = homeTopPerformer?.imageUrl;
    if (!rawUrl || !rawUrl.trim()) {
      homeTopPerformerImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    const trimmed = rawUrl.trim();
    img.src =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? `/api/image-proxy?url=${encodeURIComponent(trimmed)}`
        : trimmed;
    homeTopPerformerImgRef.current = img;
  }, [homeTopPerformer?.imageUrl]);

  // Active Preview & Live Scene objects
  const previewScene = useMemo(
    () => scenes.find((s) => s.id === previewSceneId) ?? scenes[0],
    [scenes, previewSceneId]
  );
  const liveScene = useMemo(
    () => scenes.find((s) => s.id === liveSceneId) ?? scenes[0],
    [scenes, liveSceneId]
  );

  // Deduplicated list of all Cameras across Scenes (so every camera has its own Timeline track & Replay option!)
  const availableStudioCameras: StudioCameraTrackInfo[] = useMemo(() => {
    const list: StudioCameraTrackInfo[] = [
      {
        cameraId: "clean_program",
        label: "🎥 Main Program Cam (Raw Clean)",
        angleName: "MAIN PROGRAM • RAW CLEAN",
        sourceType: "clean_program",
      },
    ];
    const seenKeys = new Set<string>(["clean_program"]);

    // 1. Add cameras from all Camera Scenes in stable scene order so timeline tracks never jump when switching scenes
    for (const sc of scenes) {
      if (sc.kind !== "camera_scene") continue;
      for (const slot of sc.cameras) {
        const key =
          slot.sourceType === "wireless_phone"
            ? `wireless:${(slot.wirelessRoomCode || slot.id).trim().toUpperCase()}`
            : `slot:${slot.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const label =
          slot.sourceType === "wireless_phone"
            ? `📱 ${slot.angleName || slot.label} (${(slot.wirelessRoomCode || "CAM").toUpperCase()})`
            : `🎥 ${slot.angleName || slot.label} (${sc.name.split(":")[0]})`;
        list.push({
          cameraId: key,
          label,
          angleName: slot.angleName || slot.label,
          sourceType: slot.sourceType,
          slot,
        });
      }
    }

    // 2. Also include any Saved Wireless Cameras not yet added
    for (const wc of savedWirelessCameras) {
      const key = `wireless:${wc.roomCode.trim().toUpperCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      list.push({
        cameraId: key,
        label: `${wc.platform === "android" ? "🤖" : "🍎"} ${wc.name} (${wc.roomCode.toUpperCase()})`,
        angleName: wc.name,
        sourceType: "wireless_phone",
        slot: {
          id: wc.id,
          label: wc.name,
          sourceType: "wireless_phone",
          deviceId: "",
          angleName: wc.name,
          wirelessRoomCode: wc.roomCode.toUpperCase(),
          wirelessIpUrl: wc.ipUrl,
          wirelessPlatform: wc.platform,
          savedWirelessCamId: wc.id,
        },
      });
    }

    return list;
  }, [scenes, liveScene, previewScene, savedWirelessCameras]);

  // Active Advertisement Item & Image Cache
  const activeAdItem = useMemo(
    () => adItems.find((a) => a.id === activeAdId) ?? adItems[0] ?? null,
    [adItems, activeAdId]
  );

  useEffect(() => {
    for (const ad of adItems) {
      if (!adImgCacheRef.current[ad.id] && ad.dataUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = ad.dataUrl;
        adImgCacheRef.current[ad.id] = img;
      }
    }
  }, [adItems]);

  useEffect(() => {
    if (!autoRotateAds || !showAdOverlay || adItems.length <= 1) return;
    const timer = setInterval(() => {
      setActiveAdId((prev) => {
        const idx = adItems.findIndex((a) => a.id === prev);
        const nextIdx = (idx + 1) % adItems.length;
        return adItems[nextIdx]?.id || prev;
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [autoRotateAds, showAdOverlay, adItems]);

  const handleUploadAdImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const newAd: StudioAdItem = {
          id: `ad-${generateUUID().slice(0, 8)}`,
          name: cleanName,
          dataUrl,
          createdAt: new Date().toISOString(),
        };
        setAdItems((prev) => {
          const next = [...prev, newAd];
          try {
            localStorage.setItem("boxscore_studio_ads", JSON.stringify(next));
          } catch {}
          return next;
        });
        setActiveAdId((prev) => prev || newAd.id);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleDeleteAdItem = (adId: string) => {
    delete adImgCacheRef.current[adId];
    setAdItems((prev) => {
      const next = prev.filter((a) => a.id !== adId);
      try {
        localStorage.setItem("boxscore_studio_ads", JSON.stringify(next));
      } catch {}
      if (activeAdId === adId) {
        setActiveAdId(next[0]?.id || "");
      }
      if (next.length === 0) {
        setShowAdOverlay(false);
      }
      return next;
    });
  };

  // Selected Timeline Video
  const selectedTimelineVideo = useMemo(
    () => storedVideos.find((v) => v.id === selectedTimelineVideoId) ?? storedVideos[0] ?? null,
    [storedVideos, selectedTimelineVideoId]
  );

  // Resolve the saved video specifically recorded for a given cameraId (returns null if no clip exists for that camera yet)
  const resolveStoredVideoForCamera = useCallback(
    (
      camKey: string,
      videoList: StoredGameVideo[] = storedVideos
    ): StoredGameVideo | null => {
      if (!camKey || camKey === "clean_program") {
        if (
          selectedTimelineVideo &&
          (!selectedTimelineVideo.cameraId ||
            selectedTimelineVideo.cameraId === "clean_program")
        ) {
          return selectedTimelineVideo;
        }
        if (selectedTimelineVideo?.recordingSessionId) {
          const cleanSibling = videoList.find(
            (v) =>
              v.recordingSessionId ===
                selectedTimelineVideo.recordingSessionId &&
              (!v.cameraId || v.cameraId === "clean_program")
          );
          if (cleanSibling) return cleanSibling;
        }
        return (
          videoList.find(
            (v) => !v.cameraId || v.cameraId === "clean_program"
          ) ??
          selectedTimelineVideo ??
          videoList[0] ??
          null
        );
      }

      if (selectedTimelineVideo?.cameraId === camKey) {
        return selectedTimelineVideo;
      }
      if (selectedTimelineVideo?.recordingSessionId) {
        const sibling = videoList.find(
          (v) =>
            v.recordingSessionId === selectedTimelineVideo.recordingSessionId &&
            v.cameraId === camKey
        );
        if (sibling) return sibling;
      }
      const directMatch = videoList.find((v) => v.cameraId === camKey);
      return directMatch ?? null;
    },
    [selectedTimelineVideo, storedVideos]
  );

  // Active Timeline Video for the currently selected camera track
  const activeCameraTimelineVideo = useMemo(
    () =>
      resolveStoredVideoForCamera(selectedTimelineCameraKey) ??
      (selectedTimelineCameraKey === "clean_program"
        ? selectedTimelineVideo
        : null),
    [resolveStoredVideoForCamera, selectedTimelineCameraKey, selectedTimelineVideo]
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
        const savedDuration = window.localStorage.getItem(
          "boxscore_studio_transition_duration"
        );
        if (savedDuration) {
          const parsed = Number(savedDuration);
          if (Number.isFinite(parsed) && parsed >= 150 && parsed <= 5000) {
            setTransitionDurationMs(parsed);
          }
        }
        const savedDesign = window.localStorage.getItem(
          "boxscore_studio_transition_design"
        );
        if (
          savedDesign === "slash_wipe" ||
          savedDesign === "split_doors" ||
          savedDesign === "diamond_burst"
        ) {
          setSelectedTransitionDesign(savedDesign);
        }
      } catch {
        // ignore
      }
    }
  }, [refreshCameraDevices]);

  const handleUpdateTransitionDuration = useCallback((ms: number) => {
    const clamped = Math.max(150, Math.min(5000, Math.round(ms)));
    setTransitionDurationMs(clamped);
    try {
      window.localStorage.setItem(
        "boxscore_studio_transition_duration",
        String(clamped)
      );
    } catch {
      // ignore
    }
  }, []);

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

  // Wireless Hub Channel, Per-Room Zoom Level & Last Active Wireless Room Refs
  const wirelessHubChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const wirelessZoomByRoomRef = useRef<Record<string, number>>({});
  const lastConnectedWirelessRoomRef = useRef<string>("");

  // Helper to mount hidden <video> elements in the DOM so Chromium & WebKit always decode WebRTC/Camera streams
  const mountHiddenVideoElement = (vid: HTMLVideoElement) => {
    if (typeof document === "undefined") return;
    vid.playsInline = true;
    vid.muted = true;
    vid.autoplay = true;
    vid.setAttribute("playsinline", "true");
    vid.setAttribute("webkit-playsinline", "true");
    vid.style.position = "fixed";
    vid.style.left = "-9999px";
    vid.style.top = "0px";
    vid.style.width = "2px";
    vid.style.height = "2px";
    vid.style.opacity = "0";
    vid.style.pointerEvents = "none";
    const container = hiddenVideosContainerRef.current || document.body;
    if (container && !vid.parentElement) {
      container.appendChild(vid);
    }
  };

  // Ensure hidden <video> element exists for each camera slot
  const getOrCreateSlotVideoElement = (slotId: string): HTMLVideoElement => {
    if (!videoElBySlotRef.current[slotId]) {
      const vid = document.createElement("video");
      mountHiddenVideoElement(vid);
      videoElBySlotRef.current[slotId] = vid;
    } else {
      mountHiddenVideoElement(videoElBySlotRef.current[slotId]);
    }
    return videoElBySlotRef.current[slotId];
  };

  // Ensure shared hidden <video> element exists for a wireless Room Code so multiple Scenes can render the same iPhone/Android camera
  const getOrCreateRoomVideoElement = (roomCode: string): HTMLVideoElement => {
    const clean = roomCode.trim().toUpperCase();
    if (!wirelessVideoElByRoomRef.current[clean]) {
      const vid = document.createElement("video");
      mountHiddenVideoElement(vid);
      wirelessVideoElByRoomRef.current[clean] = vid;
    } else {
      mountHiddenVideoElement(wirelessVideoElByRoomRef.current[clean]);
    }
    return wirelessVideoElByRoomRef.current[clean];
  };

  // Connect Wireless Phone Camera (iPhone / Android) via Supabase Realtime + HTTP Signaling + WebRTC / Frame Relay (shared by Room Code across all Scenes)
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

      // Helper to propagate a roomCode's stream, relay frame, and status to ALL matching slots across ALL scenes
      const syncRoomStateToAllMatchingSlots = (
        status: "waiting" | "webrtc" | "relay" | "ip",
        remoteStream?: MediaStream,
        relayImg?: HTMLImageElement
      ) => {
        if (status === "webrtc" || status === "relay") {
          lastConnectedWirelessRoomRef.current = roomCode;
        }
        if (remoteStream) {
          streamBySlotRef.current[slot.id] = remoteStream;
          const slotVid = getOrCreateSlotVideoElement(slot.id);
          if (slotVid.srcObject !== remoteStream) {
            slotVid.srcObject = remoteStream;
            void slotVid.play().catch(() => {});
          }
        }
        if (relayImg) {
          wirelessFrameImgBySlotRef.current[slot.id] = relayImg;
        }
        setWirelessStatusByRoom((prev) =>
          prev[roomCode] === "webrtc" && status === "relay"
            ? prev
            : { ...prev, [roomCode]: status }
        );
        setScenes((currentScenes) => {
          const matchingIds: string[] = [slot.id];
          let didUpdateSceneRoom = false;
          const nextScenes = currentScenes.map((sc) => {
            const wirelessSlotsInScene = sc.cameras.filter(
              (cam) => cam.sourceType === "wireless_phone"
            );
            const updatedCams = sc.cameras.map((c) => {
              if (c.sourceType !== "wireless_phone") return c;
              const cRoom = (
                c.wirelessRoomCode || `CAM${c.id.slice(-4).toUpperCase()}`
              )
                .trim()
                .toUpperCase();
              const isCConnected =
                Boolean(wirelessStreamByRoomRef.current[cRoom]?.active) ||
                Boolean(wirelessFrameImgByRoomRef.current[cRoom]?.complete && wirelessFrameImgByRoomRef.current[cRoom]?.naturalWidth > 0);

              // Auto-bind if this slot matches roomCode OR if this scene has a single unconnected wireless slot
              const shouldAutoBind =
                cRoom === roomCode ||
                ((status === "webrtc" || status === "relay") &&
                  !isCConnected &&
                  wirelessSlotsInScene.length === 1);

              if (shouldAutoBind) {
                matchingIds.push(c.id);
                if (remoteStream) {
                  streamBySlotRef.current[c.id] = remoteStream;
                  const cVid = getOrCreateSlotVideoElement(c.id);
                  if (cVid.srcObject !== remoteStream) {
                    cVid.srcObject = remoteStream;
                    void cVid.play().catch(() => {});
                  }
                }
                if (relayImg) {
                  wirelessFrameImgBySlotRef.current[c.id] = relayImg;
                }
                if (cRoom !== roomCode) {
                  didUpdateSceneRoom = true;
                  return { ...c, wirelessRoomCode: roomCode };
                }
              }
              return c;
            });
            return didUpdateSceneRoom ? { ...sc, cameras: updatedCams } : sc;
          });

          setActiveSlotIds((prev) => {
            const next = { ...prev };
            for (const id of matchingIds) next[id] = true;
            return next;
          });
          setWirelessStatusBySlot((prev) => {
            const next = { ...prev };
            for (const id of matchingIds) {
              if (next[id] === "webrtc" && status === "relay") continue;
              next[id] = status;
            }
            return next;
          });
          return didUpdateSceneRoom ? nextScenes : currentScenes;
        });
      };

      // If this Room Code is already connected and no forced reconnect is requested, reuse the live stream!
      if (!forceReconnect && wirelessChannelByRoomRef.current[roomCode]) {
        const existingStream = wirelessStreamByRoomRef.current[roomCode];
        if (existingStream) {
          const roomVid = getOrCreateRoomVideoElement(roomCode);
          if (roomVid.srcObject !== existingStream) {
            roomVid.srcObject = existingStream;
          }
          void roomVid.play().catch(() => {});
          syncRoomStateToAllMatchingSlots("webrtc", existingStream);
        } else if (wirelessFrameImgByRoomRef.current[roomCode]) {
          syncRoomStateToAllMatchingSlots(
            "relay",
            undefined,
            wirelessFrameImgByRoomRef.current[roomCode]
          );
        }
        // Ping phone via both Supabase & HTTP signaling in case it is waiting to send a WebRTC offer
        if (!wirelessStreamByRoomRef.current[roomCode]) {
          void wirelessChannelByRoomRef.current[roomCode].send({
            type: "broadcast",
            event: "studio_ready",
            payload: { roomCode },
          });
          if (wirelessHubChannelRef.current) {
            void wirelessHubChannelRef.current.send({
              type: "broadcast",
              event: "studio_ready",
              payload: { roomCode },
            });
          }
          void fetch("/api/wireless-cam", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomCode, action: "studio_ready" }),
          }).catch(() => {});
        }
        return;
      }

      // Clean up existing channel / PeerConnection / HTTP poll for this Room Code before creating a fresh connection
      if (wirelessHttpPollByRoomRef.current[roomCode]) {
        clearInterval(wirelessHttpPollByRoomRef.current[roomCode]);
        delete wirelessHttpPollByRoomRef.current[roomCode];
      }
      if (wirelessPcByRoomRef.current[roomCode]) {
        try {
          wirelessPcByRoomRef.current[roomCode].close();
        } catch {}
        delete wirelessPcByRoomRef.current[roomCode];
      }
      delete pendingIceCandidatesByRoomRef.current[roomCode];
      if (wirelessChannelByRoomRef.current[roomCode]) {
        void supabase.removeChannel(wirelessChannelByRoomRef.current[roomCode]);
        delete wirelessChannelByRoomRef.current[roomCode];
      }

      setWirelessStatusBySlot((prev) => ({ ...prev, [slot.id]: "waiting" }));
      setWirelessStatusByRoom((prev) => ({ ...prev, [roomCode]: "waiting" }));
      pendingIceCandidatesByRoomRef.current[roomCode] = [];
      wirelessHandledOfferTsByRoomRef.current[roomCode] = 0;

      const syncDetectedPhonePlatform = (rawPlatform?: unknown, rawZoom?: unknown) => {
        if (typeof rawZoom === "number" && rawZoom >= 1) {
          wirelessZoomByRoomRef.current[roomCode] = Math.min(5, Math.max(1, rawZoom));
        }
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
          } catch {}
          return updated;
        });
      };

      const ch = supabase.channel(`boxscore-wireless-cam-${roomCode}`, {
        config: { broadcast: { self: false } },
      });
      wirelessChannelByRoomRef.current[roomCode] = ch;
      wirelessChannelBySlotRef.current[slot.id] = ch;

      // Shared WebRTC Offer Handler (invoked by either Supabase Realtime OR HTTP Signaling Poll)
      let isHandlingOffer = false;
      const handleIncomingWebRtcOffer = async (
        sdp: RTCSessionDescriptionInit,
        devicePlatform?: unknown,
        offerId?: string,
        zoomLevel?: unknown
      ) => {
        if (isHandlingOffer) return;
        isHandlingOffer = true;
        try {
          syncDetectedPhonePlatform(devicePlatform, zoomLevel);
          if (wirelessPcByRoomRef.current[roomCode]) {
            try {
              wirelessPcByRoomRef.current[roomCode].close();
            } catch {}
          }

          if (!pendingIceCandidatesByRoomRef.current[roomCode]) {
            pendingIceCandidatesByRoomRef.current[roomCode] = [];
          }

          const pc = new RTCPeerConnection(RTC_CONFIG);
          wirelessPcByRoomRef.current[roomCode] = pc;
          wirelessPcBySlotRef.current[slot.id] = pc;

          pc.ontrack = (ev) => {
            const remoteStream =
              ev.streams && ev.streams[0]
                ? ev.streams[0]
                : new MediaStream([ev.track]);

            wirelessStreamByRoomRef.current[roomCode] = remoteStream;
            const roomVidEl = getOrCreateRoomVideoElement(roomCode);
            roomVidEl.srcObject = remoteStream;
            void roomVidEl.play().catch(() => {});

            syncRoomStateToAllMatchingSlots("webrtc", remoteStream);
          };

          const handleStateChange = () => {
            const state = pc.connectionState;
            const iceState = pc.iceConnectionState;
            if (
              state === "connected" ||
              iceState === "connected" ||
              iceState === "completed"
            ) {
              const st = wirelessStreamByRoomRef.current[roomCode];
              if (st) {
                const roomVidEl = getOrCreateRoomVideoElement(roomCode);
                if (roomVidEl.paused) void roomVidEl.play().catch(() => {});
              }
              syncRoomStateToAllMatchingSlots("webrtc", st);
            }
          };

          pc.onconnectionstatechange = handleStateChange;
          pc.oniceconnectionstatechange = handleStateChange;

          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              const candidateJson = ev.candidate.toJSON();
              const icePayload = {
                roomCode,
                offerId,
                candidate: candidateJson,
              };
              void ch.send({
                type: "broadcast",
                event: "webrtc_ice_from_studio",
                payload: icePayload,
              });
              if (wirelessHubChannelRef.current) {
                void wirelessHubChannelRef.current.send({
                  type: "broadcast",
                  event: "webrtc_ice_from_studio",
                  payload: icePayload,
                });
              }
              void fetch("/api/wireless-cam", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  roomCode,
                  action: "studio_ice",
                  offerId,
                  candidate: candidateJson,
                }),
              }).catch(() => {});
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushBufferedIceCandidates(
            pc,
            pendingIceCandidatesByRoomRef.current[roomCode]
          );

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const answerPayload = {
            roomCode,
            offerId,
            sdp: pc.localDescription,
          };

          await ch.send({
            type: "broadcast",
            event: "webrtc_answer",
            payload: answerPayload,
          });
          if (wirelessHubChannelRef.current) {
            void wirelessHubChannelRef.current.send({
              type: "broadcast",
              event: "webrtc_answer",
              payload: answerPayload,
            });
          }

          await fetch("/api/wireless-cam", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomCode,
              offerId,
              action: "answer",
              sdp: pc.localDescription,
            }),
          }).catch(() => {});
        } catch (err) {
          console.error("[WebRTC Studio] Error handling offer:", err);
        } finally {
          isHandlingOffer = false;
        }
      };

      // Shared Relay Frame Handler (invoked by either Supabase Realtime OR HTTP Signaling Poll)
      const handleIncomingRelayFrame = (
        frameDataUrl: string,
        devicePlatform?: unknown,
        zoomLevel?: unknown
      ) => {
        if (!frameDataUrl) return;
        syncDetectedPhonePlatform(devicePlatform, zoomLevel);

        // If direct WebRTC P2P is already actively decoding frames, prefer WebRTC HD
        const roomVid = wirelessVideoElByRoomRef.current[roomCode];
        const isWebRtcDecoding =
          Boolean(wirelessStreamByRoomRef.current[roomCode]?.active) &&
          Boolean(roomVid && roomVid.readyState >= 2);
        if (isWebRtcDecoding) return;

        if (!wirelessFrameImgByRoomRef.current[roomCode]) {
          wirelessFrameImgByRoomRef.current[roomCode] = new Image();
        }
        wirelessFrameImgByRoomRef.current[roomCode].src = frameDataUrl;
        syncRoomStateToAllMatchingSlots(
          "relay",
          undefined,
          wirelessFrameImgByRoomRef.current[roomCode]
        );
      };

      ch.on("broadcast", { event: "phone_joined" }, ({ payload }) => {
        syncDetectedPhonePlatform(payload?.devicePlatform, payload?.zoomLevel);
        void ch.send({
          type: "broadcast",
          event: "studio_ready",
          payload: { roomCode },
        });
      })
        .on("broadcast", { event: "webrtc_offer" }, async ({ payload }) => {
          if (!payload?.sdp) return;
          wirelessHandledOfferTsByRoomRef.current[roomCode] = Date.now();
          await handleIncomingWebRtcOffer(
            payload.sdp,
            payload?.devicePlatform,
            payload?.offerId,
            payload?.zoomLevel
          );
        })
        .on(
          "broadcast",
          { event: "webrtc_ice_from_phone" },
          async ({ payload }) => {
            try {
              const pc =
                wirelessPcByRoomRef.current[roomCode] ||
                wirelessPcBySlotRef.current[slot.id];
              if (!pendingIceCandidatesByRoomRef.current[roomCode]) {
                pendingIceCandidatesByRoomRef.current[roomCode] = [];
              }
              await addIceCandidateSafely(
                pc,
                payload?.candidate,
                pendingIceCandidatesByRoomRef.current[roomCode]
              );
            } catch {}
          }
        )
        .on("broadcast", { event: "camera_zoom" }, ({ payload }) => {
          if (typeof payload?.zoomLevel === "number") {
            wirelessZoomByRoomRef.current[roomCode] = Math.min(
              5,
              Math.max(1, payload.zoomLevel)
            );
          }
        })
        .on("broadcast", { event: "video_frame" }, ({ payload }) => {
          if (!payload?.frameDataUrl) return;
          handleIncomingRelayFrame(
            payload.frameDataUrl,
            payload?.devicePlatform,
            payload?.zoomLevel
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

      // Notify HTTP signaling endpoint that Studio is ready & poll every 450ms for HTTP WebRTC offers + live JPEG frames
      void fetch("/api/wireless-cam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, action: "studio_ready" }),
      }).catch(() => {});

      wirelessHttpPollByRoomRef.current[roomCode] = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/wireless-cam?room=${encodeURIComponent(roomCode)}&role=studio`,
            { cache: "no-store" }
          );
          if (!res.ok) return;
          const data = (await res.json()) as {
            ok?: boolean;
            devicePlatform?: "iphone" | "android";
            zoomLevel?: number;
            offerSdp?: RTCSessionDescriptionInit | null;
            offerId?: string | null;
            offerTimestamp?: number;
            phoneIceCandidates?: RTCIceCandidateInit[];
            phoneCandidates?: RTCIceCandidateInit[];
            latestFrameDataUrl?: string | null;
            latestFrameTimestamp?: number;
            latestFrameTs?: number;
          };

          if (data.devicePlatform || data.zoomLevel) {
            syncDetectedPhonePlatform(data.devicePlatform, data.zoomLevel);
          }

          const offerTs = data.offerTimestamp || 0;
          if (
            data.offerSdp &&
            offerTs > (wirelessHandledOfferTsByRoomRef.current[roomCode] || 0)
          ) {
            wirelessHandledOfferTsByRoomRef.current[roomCode] = offerTs;
            await handleIncomingWebRtcOffer(
              data.offerSdp,
              data.devicePlatform,
              data.offerId || undefined,
              data.zoomLevel
            );
          }

          const iceCands = data.phoneIceCandidates || data.phoneCandidates || [];
          if (Array.isArray(iceCands) && iceCands.length > 0) {
            const pc =
              wirelessPcByRoomRef.current[roomCode] ||
              wirelessPcBySlotRef.current[slot.id];
            if (!pendingIceCandidatesByRoomRef.current[roomCode]) {
              pendingIceCandidatesByRoomRef.current[roomCode] = [];
            }
            for (const cand of iceCands) {
              await addIceCandidateSafely(
                pc,
                cand,
                pendingIceCandidatesByRoomRef.current[roomCode]
              );
            }
          }

          const frameTs = data.latestFrameTimestamp || data.latestFrameTs || 0;
          if (
            data.latestFrameDataUrl &&
            frameTs > 0 &&
            Date.now() - frameTs < 12000
          ) {
            handleIncomingRelayFrame(
              data.latestFrameDataUrl,
              data.devicePlatform,
              data.zoomLevel
            );
          }
        } catch {
          // ignore network poll blips
        }
      }, 450);
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
      const targetVideo =
        storedVideos.find((v) => v.id === cfg.videoId) ??
        (cfg.cameraId ? resolveStoredVideoForCamera(cfg.cameraId) : null);
      if (!targetVideo) return;

      // Pre-cache timeline frame images so slow-mo replay renders immediately even while video seeks
      if (targetVideo.timelineFrames?.length) {
        for (const f of targetVideo.timelineFrames) {
          if (f.dataUrl && !replayFrameImgCacheRef.current[f.dataUrl]) {
            const img = new Image();
            img.src = f.dataUrl;
            replayFrameImgCacheRef.current[f.dataUrl] = img;
          }
        }
      }

      if (targetVideo.sizeBytes > 1000) {
        const currentVideoId = vidEl.getAttribute("data-video-id");
        if (currentVideoId !== targetVideo.id) {
          const url = URL.createObjectURL(targetVideo.blob);
          vidEl.src = url;
          vidEl.setAttribute("data-video-id", targetVideo.id);
        }

        vidEl.playbackRate = cfg.playbackRate;
        if (vidEl.currentTime < cfg.startSec || vidEl.currentTime >= cfg.endSec) {
          try {
            vidEl.currentTime = cfg.startSec;
          } catch {}
        }
        if (vidEl.paused) {
          vidEl.play().catch(() => {});
        }
      } else {
        vidEl.pause();
      }
    };

    syncReplayElement(previewScene, previewReplayVideoRef.current);
    syncReplayElement(liveScene, liveReplayVideoRef.current);
  }, [previewScene, liveScene, storedVideos, resolveStoredVideoForCamera]);

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

  // Sync Timeline Scrubber Video Element when user selects a video, switches camera track, or scrubs playhead
  useEffect(() => {
    const vidEl = timelineScrubVideoRef.current;
    const targetVid = activeCameraTimelineVideo || selectedTimelineVideo;
    if (!vidEl || !targetVid || targetVid.sizeBytes <= 1000) return;
    const currentId = vidEl.getAttribute("data-scrub-id");
    if (currentId !== targetVid.id) {
      const url = URL.createObjectURL(targetVid.blob);
      vidEl.src = url;
      vidEl.setAttribute("data-scrub-id", targetVid.id);
    }
  }, [activeCameraTimelineVideo, selectedTimelineVideo]);

  // Global Wireless Camera Hub Subscription + Real-Time ON AIR / PREVIEW Tally Broadcaster
  useEffect(() => {
    const hubCh = supabase.channel("boxscore-wireless-cam-hub", {
      config: { broadcast: { self: false } },
    });
    wirelessHubChannelRef.current = hubCh;

    const ensureRoomConnected = (payload?: {
      roomCode?: string;
      camName?: string;
      devicePlatform?: "iphone" | "android";
      zoomLevel?: number;
    }) => {
      const incomingRoom = String(payload?.roomCode || "")
        .trim()
        .toUpperCase();
      if (!incomingRoom) return null;
      if (typeof payload?.zoomLevel === "number" && payload.zoomLevel >= 1) {
        wirelessZoomByRoomRef.current[incomingRoom] = Math.min(
          5,
          Math.max(1, payload.zoomLevel)
        );
      }
      if (!wirelessChannelByRoomRef.current[incomingRoom]) {
        connectWirelessPhoneSlot({
          id: `hub-${incomingRoom}`,
          label: payload?.camName || `Mobile Cam (${incomingRoom})`,
          sourceType: "wireless_phone",
          deviceId: "",
          angleName: (payload?.camName || incomingRoom).toUpperCase(),
          wirelessRoomCode: incomingRoom,
          wirelessPlatform: payload?.devicePlatform || "iphone",
        });
      }
      return incomingRoom;
    };

    hubCh
      .on("broadcast", { event: "phone_joined" }, ({ payload }) => {
        const rm = ensureRoomConnected(payload);
        if (rm) {
          void hubCh.send({
            type: "broadcast",
            event: "studio_ready",
            payload: { roomCode: rm },
          });
        }
      })
      .on("broadcast", { event: "camera_zoom" }, ({ payload }) => {
        const rm = String(payload?.roomCode || "").trim().toUpperCase();
        if (rm && typeof payload?.zoomLevel === "number") {
          wirelessZoomByRoomRef.current[rm] = Math.min(
            5,
            Math.max(1, payload.zoomLevel)
          );
        }
      })
      .on("broadcast", { event: "video_frame" }, ({ payload }) => {
        const rm = ensureRoomConnected(payload);
        if (!rm || !payload?.frameDataUrl) return;
        lastConnectedWirelessRoomRef.current = rm;
        const roomVid = wirelessVideoElByRoomRef.current[rm];
        const isWebRtcDecoding =
          Boolean(wirelessStreamByRoomRef.current[rm]?.active) &&
          Boolean(roomVid && roomVid.readyState >= 2);
        if (isWebRtcDecoding) return;

        if (!wirelessFrameImgByRoomRef.current[rm]) {
          wirelessFrameImgByRoomRef.current[rm] = new Image();
        }
        wirelessFrameImgByRoomRef.current[rm].src = payload.frameDataUrl;
        setWirelessStatusByRoom((prev) =>
          prev[rm] === "webrtc" ? prev : { ...prev, [rm]: "relay" }
        );
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(hubCh);
      wirelessHubChannelRef.current = null;
    };
  }, [connectWirelessPhoneSlot]);

  // Broadcast ON AIR & PREVIEW Tally State to all connected Wireless Mobile Cameras in real-time
  useEffect(() => {
    const broadcastTallyState = () => {
      const onAirSet = new Set<string>();
      const previewSet = new Set<string>();

      if (liveScene?.kind === "camera_scene") {
        for (const c of liveScene.cameras) {
          if (c.sourceType === "wireless_phone") {
            const r = (
              c.wirelessRoomCode || `CAM${c.id.slice(-4).toUpperCase()}`
            )
              .trim()
              .toUpperCase();
            onAirSet.add(r);
            if (lastConnectedWirelessRoomRef.current) {
              onAirSet.add(lastConnectedWirelessRoomRef.current);
            }
          }
        }
      }

      if (previewScene?.kind === "camera_scene") {
        for (const c of previewScene.cameras) {
          if (c.sourceType === "wireless_phone") {
            const r = (
              c.wirelessRoomCode || `CAM${c.id.slice(-4).toUpperCase()}`
            )
              .trim()
              .toUpperCase();
            previewSet.add(r);
            if (lastConnectedWirelessRoomRef.current) {
              previewSet.add(lastConnectedWirelessRoomRef.current);
            }
          }
        }
      }

      const tallyPayload = {
        onAirRoomCodes: Array.from(onAirSet),
        previewRoomCodes: Array.from(previewSet),
        liveSceneName: liveScene?.name || "Main Court",
        previewSceneName: previewScene?.name || "Preview",
      };

      if (wirelessHubChannelRef.current) {
        void wirelessHubChannelRef.current.send({
          type: "broadcast",
          event: "studio_tally_state",
          payload: tallyPayload,
        });
      }
      Object.values(wirelessChannelByRoomRef.current).forEach((ch) => {
        try {
          void ch.send({
            type: "broadcast",
            event: "studio_tally_state",
            payload: tallyPayload,
          });
        } catch {}
      });
      void fetch("/api/wireless-cam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "studio_tally",
          ...tallyPayload,
        }),
      }).catch(() => {});
    };

    broadcastTallyState();
    const interval = setInterval(broadcastTallyState, 2000);
    return () => clearInterval(interval);
  }, [liveScene, previewScene, scenes, wirelessStatusByRoom]);

  // Helper: Draw a single Camera Slot (Real Webcam, Screen, Wireless Phone, or Simulated Court Angle) into a target rect
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

      const rawRoomKey =
        slot.sourceType === "wireless_phone"
          ? (
              slot.wirelessRoomCode || `CAM${slot.id.slice(-4).toUpperCase()}`
            )
              .trim()
              .toUpperCase()
          : "";
      const hasDirectRoomFeed =
        Boolean(rawRoomKey && wirelessVideoElByRoomRef.current[rawRoomKey]?.readyState && wirelessVideoElByRoomRef.current[rawRoomKey].readyState >= 2) ||
        Boolean(rawRoomKey && wirelessFrameImgByRoomRef.current[rawRoomKey]?.complete && wirelessFrameImgByRoomRef.current[rawRoomKey].naturalWidth > 0);
      const effectiveRoomKey =
        slot.sourceType === "wireless_phone" &&
        !hasDirectRoomFeed &&
        lastConnectedWirelessRoomRef.current
          ? lastConnectedWirelessRoomRef.current
          : rawRoomKey;

      let vidEl =
        (effectiveRoomKey && wirelessVideoElByRoomRef.current[effectiveRoomKey]) ||
        videoElBySlotRef.current[slot.id];
      if (
        (!vidEl || vidEl.readyState < 2) &&
        slot.sourceType === "camera" &&
        activeSlotIds[slot.id] !== false
      ) {
        const fallbackEntry = Object.entries(videoElBySlotRef.current).find(
          ([otherSlotId, el]) =>
            el && el.readyState >= 2 && activeSlotIds[otherSlotId] !== false
        );
        if (fallbackEntry) {
          vidEl = fallbackEntry[1];
        }
      }
      const wirelessImgEl =
        (effectiveRoomKey && wirelessFrameImgByRoomRef.current[effectiveRoomKey]) ||
        wirelessFrameImgBySlotRef.current[slot.id];
      const isWirelessSlotEnabled =
        slot.sourceType === "wireless_phone" &&
        activeSlotIds[slot.id] !== false &&
        (Boolean(activeSlotIds[slot.id]) ||
          Boolean(hasDirectRoomFeed) ||
          Boolean(wirelessStatusByRoom[effectiveRoomKey]) ||
          Boolean(lastConnectedWirelessRoomRef.current));
      const isStreamReady =
        slot.sourceType !== "court_sim" &&
        (slot.sourceType === "wireless_phone"
          ? isWirelessSlotEnabled
          : activeSlotIds[slot.id] !== false &&
            (Boolean(activeSlotIds[slot.id]) ||
              Boolean(vidEl && vidEl.readyState >= 2))) &&
        Boolean(vidEl && vidEl.readyState >= 2);
      const isWirelessImgReady =
        slot.sourceType === "wireless_phone" &&
        isWirelessSlotEnabled &&
        wirelessImgEl &&
        wirelessImgEl.complete &&
        wirelessImgEl.naturalWidth > 0;

      if (isStreamReady && vidEl) {
        // Draw live webcam / capture card / WebRTC wireless phone stream with object-cover scaling + digital zoom crop
        const vw = vidEl.videoWidth || 1280;
        const vh = vidEl.videoHeight || 720;
        const zoomFactor =
          slot.sourceType === "wireless_phone" && effectiveRoomKey
            ? Math.max(1, wirelessZoomByRoomRef.current[effectiveRoomKey] || 1)
            : 1;
        const srcW = vw / zoomFactor;
        const srcH = vh / zoomFactor;
        const srcX = (vw - srcW) / 2;
        const srcY = (vh - srcH) / 2;

        const scale = Math.max(rw / srcW, rh / srcH);
        const dw = srcW * scale;
        const dh = srcH * scale;
        const dx = rx + (rw - dw) / 2;
        const dy = ry + (rh - dh) / 2;
        ctx.drawImage(vidEl, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
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

  // Helper: Draw Scorebug Overlay (with League Logo, Team Logos, Short Name/Initials, Timeout Pips, Penalty Indicator & Clean Shot Clock)
  const drawScorebugOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const isDark = scorebugTheme !== "clean_light";
      const bgPrimary = isDark ? "rgba(11, 27, 48, 0.94)" : "rgba(255, 255, 255, 0.96)";
      const textColor = isDark ? "#ffffff" : "#0f172a";
      const subTextColor = isDark ? "#94a3b8" : "#64748b";
      const borderColor = isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.14)";

      // Helper to render League Logo Crest Badge
      const drawLeagueLogoCrest = (x: number, y: number, size: number, squareBox = false) => {
        ctx.save();
        const leagueImg = transitionLogoImgRef.current;
        if (squareBox) {
          ctx.beginPath();
          ctx.roundRect(x, y, size, size, [6]);
          ctx.fillStyle = "#111622";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          ctx.fillStyle = "#0f172a";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
          ctx.stroke();
        }

        if (leagueImg && leagueImg.complete && leagueImg.naturalWidth > 0) {
          ctx.clip();
          try {
            ctx.drawImage(leagueImg, x + 2, y + 2, size - 4, size - 4);
          } catch {}
        } else {
          const leagueInitials = (activeLeague?.name || "BS")
            .split(/\s+/)
            .map((w) => w[0] || "")
            .join("")
            .slice(0, 3)
            .toUpperCase();
          ctx.fillStyle = "#fbbf24";
          ctx.font = `900 ${Math.round(size * 0.36)}px 'Inter', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(leagueInitials || "🏀", x + size / 2, y + size / 2 + 1);
        }
        ctx.restore();
      };

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

      // Helper to render Timeout Pips + BONUS badge
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
        const penaltyW = inPenalty ? 54 : 0;
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
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.roundRect(badgeX, y - 5, penaltyW, 15, [4]);
          ctx.fill();

          ctx.fillStyle = "#0f172a";
          ctx.font = "900 9.5px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("BONUS", badgeX + penaltyW / 2, y + 3);
        }
        ctx.restore();
      };

      ctx.save();

      if (scorebugPosition === "bottom_bar") {
        // =====================================================================
        // BOTTOM CENTER SCOREBUG (Image 1):
        // [League Logo] | Away Team + Score | Home Score + Team | [Quarter | Game Clock | Shot Clock]
        // =====================================================================
        const bugW = 980;
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

        // 1. Left League Logo Crest Badge
        drawLeagueLogoCrest(bugX + 14, bugY + 17, 48, false);

        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(bugX + 74, bugY + 14);
        ctx.lineTo(bugX + 74, bugY + bugH - 14);
        ctx.stroke();

        // 2. Away Team Color Accent + Logo + Short Name/Initials + Score + Timeouts/Penalty
        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 84, bugY + 12, 6, bugH - 24, [3]);
        ctx.fill();

        drawTeamLogoCrest(
          awayLogoImgRef.current,
          awayColor,
          awayScorebugName,
          bugX + 96,
          bugY + 17,
          48
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(awayScorebugName.slice(0, 10).toUpperCase(), bugX + 154, bugY + 32);

        drawTimeoutAndPenaltyRow(
          awayTimeoutsRemaining,
          isAwayInPenalty,
          bugX + 154,
          bugY + 55,
          "left"
        );

        ctx.fillStyle = textColor;
        ctx.font = "900 36px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(awayScore), bugX + 366, bugY + bugH / 2);

        // Center Divider between Away & Home
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(bugX + 382, bugY + 12);
        ctx.lineTo(bugX + 382, bugY + bugH - 12);
        ctx.stroke();

        // 3. Home Team Score + Short Name/Initials + Timeouts/Penalty + Logo + Color Accent
        ctx.fillStyle = textColor;
        ctx.font = "900 36px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(String(homeScore), bugX + 398, bugY + bugH / 2);

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.fillText(homeScorebugName.slice(0, 10).toUpperCase(), bugX + 468, bugY + 32);

        drawTimeoutAndPenaltyRow(
          homeTimeoutsRemaining,
          isHomeInPenalty,
          bugX + 468,
          bugY + 55,
          "left"
        );

        drawTeamLogoCrest(
          homeLogoImgRef.current,
          homeColor,
          homeScorebugName,
          bugX + 632,
          bugY + 17,
          48
        );

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 686, bugY + 12, 6, bugH - 24, [3]);
        ctx.fill();

        // 4. Right Horizontal Box: Quarter — Game Clock — Shot Clock
        const clockBoxX = bugX + 704;
        const clockBoxW = bugW - 714;
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
        ctx.beginPath();
        ctx.roundRect(clockBoxX, bugY + 8, clockBoxW, bugH - 16, [12]);
        ctx.fill();

        // Left segment inside box: Quarter (e.g. Q4)
        const qCenterX = clockBoxX + 44;
        ctx.fillStyle = isDark ? "#ffffff" : "#0f172a";
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getPeriodLabel(period).toUpperCase(), qCenterX, bugY + bugH / 2);

        // Divider 1
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(clockBoxX + 84, bugY + 18);
        ctx.lineTo(clockBoxX + 84, bugY + bugH - 18);
        ctx.stroke();

        // Middle segment inside box: Game Clock (e.g. 00:00)
        const gameClockCenterX = showShotClock ? clockBoxX + 146 : clockBoxX + (clockBoxW + 84) / 2;
        ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
        ctx.font = "900 26px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(formatClock(clockSeconds), gameClockCenterX, bugY + bugH / 2);

        // Right segment inside box: Shot Clock (e.g. 24 or 0)
        if (showShotClock) {
          if (shotClock <= 0) {
            ctx.save();
            ctx.fillStyle = "rgba(239, 68, 68, 0.28)";
            ctx.beginPath();
            ctx.roundRect(clockBoxX + 208, bugY + 8, clockBoxW - 208, bugH - 16, [0, 12, 12, 0]);
            ctx.fill();
            ctx.restore();
          }
          ctx.strokeStyle = borderColor;
          ctx.beginPath();
          ctx.moveTo(clockBoxX + 208, bugY + 18);
          ctx.lineTo(clockBoxX + 208, bugY + bugH - 18);
          ctx.stroke();

          const shotClockCenterX = clockBoxX + 237;
          ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
          ctx.font = "900 28px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(Math.max(0, shotClock)), shotClockCenterX, bugY + bugH / 2);
        }
      } else {
        // =====================================================================
        // BOTTOM-LEFT BUG ("bottom_left") & TOP-LEFT BUG ("top_corner")
        // Exact 2-Row Rectangular NBA/TSN Broadcast Design (Image 2) + League Logo!
        // =====================================================================
        const rowH = 46;
        const bugH = rowH * 2; // 92px total height
        const leagueColW = 50;
        const teamColW = 176;
        const scoreColW = 92;
        const clockColW = 134;
        const bugW = leagueColW + teamColW + scoreColW + clockColW; // 452px
        const bugX = 36;
        const bugY =
          scorebugPosition === "bottom_left" ? height - bugH - 28 : 54;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 5;

        // Clip outer rectangular broadcast frame with crisp 5px corners
        ctx.beginPath();
        ctx.roundRect(bugX, bugY, bugW, bugH, [5]);
        ctx.fillStyle = "#161920";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.clip();

        // ---------------------------------------------------------------------
        // COLUMN 0: League Logo Left Cap (50px x 92px)
        // ---------------------------------------------------------------------
        ctx.fillStyle = "#11151d";
        ctx.fillRect(bugX, bugY, leagueColW, bugH);
        drawLeagueLogoCrest(bugX + 5, bugY + (bugH - 40) / 2, 40, false);

        // Vertical separator after League Logo
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(bugX + leagueColW - 1, bugY, 1, bugH);

        // ---------------------------------------------------------------------
        // COLUMN 1: Stacked Team Colored Bars (Away on Top, Home on Bottom)
        // ---------------------------------------------------------------------
        const teamColX = bugX + leagueColW;

        const drawBroadcastTeamBar = (
          rowY: number,
          bgColor: string,
          logoEl: HTMLImageElement | null,
          shortName: string,
          timeoutsLeft: number,
          inPenalty: boolean,
          isTopRow: boolean
        ) => {
          ctx.save();
          // Base team color fill
          ctx.fillStyle = bgColor;
          ctx.fillRect(teamColX, rowY, teamColW, rowH);

          // Subtle broadcast top gloss / bottom shade gradient
          const gloss = ctx.createLinearGradient(teamColX, rowY, teamColX, rowY + rowH);
          gloss.addColorStop(0, "rgba(255, 255, 255, 0.22)");
          gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
          gloss.addColorStop(1, "rgba(0, 0, 0, 0.28)");
          ctx.fillStyle = gloss;
          ctx.fillRect(teamColX, rowY, teamColW, rowH);

          // Team Logo (left side of colored bar)
          drawTeamLogoCrest(
            logoEl,
            bgColor,
            shortName,
            teamColX + 8,
            rowY + 5,
            36
          );

          // Bold White Team Initials (e.g. TOR / DEN / LAL / DAL)
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
          ctx.shadowBlur = 4;
          ctx.font = "900 25px 'Inter', sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(
            shortName.slice(0, 6).toUpperCase(),
            teamColX + 50,
            rowY + rowH / 2 + 1,
            inPenalty ? teamColW - 104 : teamColW - 56
          );
          ctx.shadowColor = "transparent";

          // Prominent BONUS Pill Badge inside Team Bar when in Penalty
          if (inPenalty) {
            const bW = 46;
            const bH = 15;
            const bX = teamColX + teamColW - bW - 6;
            const bY = rowY + (rowH - bH) / 2;
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.roundRect(bX, bY, bW, bH, [3]);
            ctx.fill();

            ctx.fillStyle = "#0f172a";
            ctx.font = "900 8.5px 'Inter', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("BONUS", bX + bW / 2, bY + bH / 2 + 0.5);
          }

          // Timeout Pips along top edge (Away) or bottom edge (Home) like Image 2
          const maxPips = 5;
          const pipW = 14;
          const pipH = 3.5;
          const pipGap = 4;
          const totalPipsW = maxPips * pipW + (maxPips - 1) * pipGap;
          const pipsStartX = teamColX + teamColW - totalPipsW - 8;
          const pipsY = isTopRow ? rowY + 2 : rowY + rowH - pipH - 2;

          for (let i = 0; i < maxPips; i++) {
            ctx.fillStyle =
              i < timeoutsLeft ? "#fde047" : "rgba(255, 255, 255, 0.22)";
            ctx.fillRect(pipsStartX + i * (pipW + pipGap), pipsY, pipW, pipH);
          }
          ctx.restore();
        };

        drawBroadcastTeamBar(
          bugY,
          awayColor,
          awayLogoImgRef.current,
          awayScorebugName,
          awayTimeoutsRemaining,
          isAwayInPenalty,
          true
        );
        drawBroadcastTeamBar(
          bugY + rowH,
          homeColor,
          homeLogoImgRef.current,
          homeScorebugName,
          homeTimeoutsRemaining,
          isHomeInPenalty,
          false
        );

        // ---------------------------------------------------------------------
        // COLUMN 2: Stacked White Score Boxes with Vertical BONUS Strip (Image 2)
        // ---------------------------------------------------------------------
        const scoreColX = teamColX + teamColW;

        const drawWhiteScoreBox = (
          rowY: number,
          scoreVal: number,
          inPenalty: boolean,
          teamAccentColor: string
        ) => {
          ctx.save();
          // Crisp white / light-silver broadcast box
          const scoreGrad = ctx.createLinearGradient(scoreColX, rowY, scoreColX, rowY + rowH);
          scoreGrad.addColorStop(0, "#ffffff");
          scoreGrad.addColorStop(1, "#e2e8f0");
          ctx.fillStyle = scoreGrad;
          ctx.fillRect(scoreColX, rowY, scoreColW, rowH);

          // Vertical BONUS indicator along left edge of white score box
          if (inPenalty) {
            ctx.fillStyle = teamAccentColor || "#dc2626";
            ctx.fillRect(scoreColX, rowY, 13, rowH);
            ctx.save();
            ctx.translate(scoreColX + 6.5, rowY + rowH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 7.5px 'Inter', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("BONUS", 0, 0);
            ctx.restore();
          } else {
            // Subtle vertical tick strip when not in bonus
            ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
            ctx.fillRect(scoreColX, rowY, 4, rowH);
          }

          // Bold Black Score Number
          ctx.fillStyle = "#0f172a";
          ctx.font = "900 32px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            String(scoreVal),
            scoreColX + (inPenalty ? (scoreColW + 11) / 2 : scoreColW / 2),
            rowY + rowH / 2 + 1
          );
          ctx.restore();
        };

        drawWhiteScoreBox(bugY, awayScore, isAwayInPenalty, awayColor);
        drawWhiteScoreBox(bugY + rowH, homeScore, isHomeInPenalty, homeColor);

        // ---------------------------------------------------------------------
        // COLUMN 3: Right Clock / Quarter / Shot Clock Column (Image 2)
        // Top Row = Dark Charcoal Game Clock ("2:31")
        // Bottom Row = Split Left Quarter ("3RD") + Right Crimson Shot Clock (":06")
        // ---------------------------------------------------------------------
        const clockColX = scoreColX + scoreColW;

        // Top Row: Game Clock Box
        const topClockGrad = ctx.createLinearGradient(clockColX, bugY, clockColX, bugY + rowH);
        topClockGrad.addColorStop(0, "#2d3139");
        topClockGrad.addColorStop(1, "#181a20");
        ctx.fillStyle = topClockGrad;
        ctx.fillRect(clockColX, bugY, clockColW, rowH);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 26px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          formatClock(clockSeconds),
          clockColX + clockColW / 2,
          bugY + rowH / 2 + 1
        );

        // Bottom Row: Left = Quarter ("1ST", "2ND", "3RD", "4TH", "OT"), Right = Crimson Shot Clock (":24")
        const bottomRowY = bugY + rowH;
        const qBoxW = showShotClock ? Math.round(clockColW * 0.52) : clockColW;
        const scBoxW = clockColW - qBoxW;

        const qGrad = ctx.createLinearGradient(clockColX, bottomRowY, clockColX, bottomRowY + rowH);
        qGrad.addColorStop(0, "#32363f");
        qGrad.addColorStop(1, "#1f2229");
        ctx.fillStyle = qGrad;
        ctx.fillRect(clockColX, bottomRowY, qBoxW, rowH);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 21px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          getBroadcastOrdinalPeriodLabel(period),
          clockColX + qBoxW / 2,
          bottomRowY + rowH / 2 + 1
        );

        if (showShotClock) {
          const scX = clockColX + qBoxW;
          const scGrad = ctx.createLinearGradient(scX, bottomRowY, scX, bottomRowY + rowH);
          if (shotClock <= 5) {
            scGrad.addColorStop(0, "#ef4444");
            scGrad.addColorStop(1, "#991b1b");
          } else {
            scGrad.addColorStop(0, "#d92638");
            scGrad.addColorStop(1, "#9f1222");
          }
          ctx.fillStyle = scGrad;
          ctx.fillRect(scX, bottomRowY, scBoxW, rowH);

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 23px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `:${String(shotClock).padStart(2, "0")}`,
            scX + scBoxW / 2,
            bottomRowY + rowH / 2 + 1
          );
        }

        // Horizontal divider line between Row 1 and Row 2
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(bugX + leagueColW, bugY + rowH - 0.75, bugW - leagueColW, 1.5);

        // Outer metallic border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
        ctx.lineWidth = 2;
        ctx.strokeRect(bugX + 1, bugY + 1, bugW - 2, bugH - 2);

        ctx.restore();
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
      activeLeague?.name,
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

  // Helper: Draw Broadcast Team Comparison Stats Overlay (All Stats Card OR Per-Stat Comparison Banner like FG, REB, etc.)
  const drawTeamComparisonOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Single-Stat Broadcast Lower-Third / Banner when a specific stat is selected
      if (teamComparisonStatKey !== "ALL") {
        const statMetaMap: Record<
          Exclude<typeof teamComparisonStatKey, "ALL">,
          {
            title: string;
            awayPrimary: string;
            awaySub: string;
            homePrimary: string;
            homeSub: string;
            awayVal: number;
            homeVal: number;
            lowerIsBetter?: boolean;
          }
        > = {
          FG: {
            title: "FIELD GOALS COMPARISON",
            awayPrimary: `${teamComparisonStats.away.fgPct}%`,
            awaySub: `${teamComparisonStats.away.fgm}/${teamComparisonStats.away.fga} FG`,
            homePrimary: `${teamComparisonStats.home.fgPct}%`,
            homeSub: `${teamComparisonStats.home.fgm}/${teamComparisonStats.home.fga} FG`,
            awayVal: teamComparisonStats.away.fgPct || teamComparisonStats.away.fgm,
            homeVal: teamComparisonStats.home.fgPct || teamComparisonStats.home.fgm,
          },
          "3PT": {
            title: "3-POINT SHOOTING COMPARISON",
            awayPrimary: `${teamComparisonStats.away.tpPct}%`,
            awaySub: `${teamComparisonStats.away.tpm}/${teamComparisonStats.away.tpa} 3PT`,
            homePrimary: `${teamComparisonStats.home.tpPct}%`,
            homeSub: `${teamComparisonStats.home.tpm}/${teamComparisonStats.home.tpa} 3PT`,
            awayVal: teamComparisonStats.away.tpPct || teamComparisonStats.away.tpm,
            homeVal: teamComparisonStats.home.tpPct || teamComparisonStats.home.tpm,
          },
          FT: {
            title: "FREE THROWS COMPARISON",
            awayPrimary: `${teamComparisonStats.away.ftPct}%`,
            awaySub: `${teamComparisonStats.away.ftm}/${teamComparisonStats.away.fta} FT`,
            homePrimary: `${teamComparisonStats.home.ftPct}%`,
            homeSub: `${teamComparisonStats.home.ftm}/${teamComparisonStats.home.fta} FT`,
            awayVal: teamComparisonStats.away.ftPct || teamComparisonStats.away.ftm,
            homeVal: teamComparisonStats.home.ftPct || teamComparisonStats.home.ftm,
          },
          REB: {
            title: "TOTAL REBOUNDS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.reb),
            awaySub: `${teamComparisonStats.away.oreb} OREB • ${teamComparisonStats.away.dreb} DREB`,
            homePrimary: String(teamComparisonStats.home.reb),
            homeSub: `${teamComparisonStats.home.oreb} OREB • ${teamComparisonStats.home.dreb} DREB`,
            awayVal: teamComparisonStats.away.reb,
            homeVal: teamComparisonStats.home.reb,
          },
          AST: {
            title: "TEAM ASSISTS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.ast),
            awaySub: "TOTAL ASSISTS",
            homePrimary: String(teamComparisonStats.home.ast),
            homeSub: "TOTAL ASSISTS",
            awayVal: teamComparisonStats.away.ast,
            homeVal: teamComparisonStats.home.ast,
          },
          STL: {
            title: "TEAM STEALS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.stl),
            awaySub: "TOTAL STEALS",
            homePrimary: String(teamComparisonStats.home.stl),
            homeSub: "TOTAL STEALS",
            awayVal: teamComparisonStats.away.stl,
            homeVal: teamComparisonStats.home.stl,
          },
          BLK: {
            title: "TEAM BLOCKS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.blk),
            awaySub: "TOTAL BLOCKS",
            homePrimary: String(teamComparisonStats.home.blk),
            homeSub: "TOTAL BLOCKS",
            awayVal: teamComparisonStats.away.blk,
            homeVal: teamComparisonStats.home.blk,
          },
          TOV: {
            title: "TURNOVERS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.tov),
            awaySub: "TOTAL TURNOVERS",
            homePrimary: String(teamComparisonStats.home.tov),
            homeSub: "TOTAL TURNOVERS",
            awayVal: teamComparisonStats.away.tov,
            homeVal: teamComparisonStats.home.tov,
            lowerIsBetter: true,
          },
          PF: {
            title: "TEAM FOULS COMPARISON",
            awayPrimary: String(teamComparisonStats.away.fouls),
            awaySub: isAwayInPenalty ? "IN BONUS PENALTY" : "TEAM FOULS",
            homePrimary: String(teamComparisonStats.home.fouls),
            homeSub: isHomeInPenalty ? "IN BONUS PENALTY" : "TEAM FOULS",
            awayVal: teamComparisonStats.away.fouls,
            homeVal: teamComparisonStats.home.fouls,
            lowerIsBetter: true,
          },
        };

        const meta = statMetaMap[teamComparisonStatKey];
        const bannerW = 760;
        const bannerH = 118;
        const bannerX = Math.round((width - bannerW) / 2);
        const bannerY = height - 216; // Positioned cleanly above bottom scorebug without blocking court action
        const centerX = bannerX + bannerW / 2;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;

        ctx.fillStyle = "rgba(11, 18, 32, 0.96)";
        ctx.beginPath();
        ctx.roundRect(bannerX, bannerY, bannerW, bannerH, [18]);
        ctx.fill();

        const borderGrad = ctx.createLinearGradient(bannerX, bannerY, bannerX + bannerW, bannerY);
        borderGrad.addColorStop(0, awayColor);
        borderGrad.addColorStop(0.5, "rgba(255,255,255,0.28)");
        borderGrad.addColorStop(1, homeColor);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = borderGrad;
        ctx.stroke();
        ctx.shadowColor = "transparent";

        // Top Pill Header
        ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
        ctx.beginPath();
        ctx.roundRect(centerX - 165, bannerY + 8, 330, 24, [12]);
        ctx.fill();

        ctx.fillStyle = "#fbbf24";
        ctx.font = "900 11px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(meta.title, centerX, bannerY + 20);

        // Away Team Logo & Name (Left)
        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bannerX + 12, bannerY + 16, 6, bannerH - 32, [3]);
        ctx.fill();

        const awayImg = awayLogoImgRef.current;
        if (awayImg && awayImg.complete && awayImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(bannerX + 52, bannerY + 66, 24, 0, Math.PI * 2);
          ctx.clip();
          try {
            ctx.drawImage(awayImg, bannerX + 28, bannerY + 42, 48, 48);
          } catch {}
          ctx.restore();
        } else {
          ctx.fillStyle = awayColor;
          ctx.beginPath();
          ctx.arc(bannerX + 52, bannerY + 66, 24, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 13px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(awayScorebugName.slice(0, 3), bannerX + 52, bannerY + 67);
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 20px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(awayScorebugName, bannerX + 86, bannerY + 56);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.fillText(meta.awaySub, bannerX + 86, bannerY + 78);

        // Away Primary Value
        const awayLeads = meta.lowerIsBetter
          ? meta.awayVal <= meta.homeVal
          : meta.awayVal >= meta.homeVal;
        ctx.fillStyle = awayLeads ? "#ffffff" : "#cbd5e1";
        ctx.font = "900 34px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(meta.awayPrimary, centerX - 24, bannerY + 58);

        // Home Primary Value
        const homeLeads = meta.lowerIsBetter
          ? meta.homeVal <= meta.awayVal
          : meta.homeVal >= meta.awayVal;
        ctx.fillStyle = homeLeads ? "#ffffff" : "#cbd5e1";
        ctx.font = "900 34px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(meta.homePrimary, centerX + 24, bannerY + 58);

        // Center Divider & Dual Comparison Bar
        ctx.fillStyle = "#64748b";
        ctx.font = "900 11px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("VS", centerX, bannerY + 58);

        const barMaxHalfW = 165;
        const total = Math.max(1, meta.awayVal + meta.homeVal);
        const awayBarW =
          meta.awayVal === 0 && meta.homeVal === 0
            ? barMaxHalfW * 0.3
            : Math.max(10, Math.round((meta.awayVal / total) * barMaxHalfW));
        const homeBarW =
          meta.awayVal === 0 && meta.homeVal === 0
            ? barMaxHalfW * 0.3
            : Math.max(10, Math.round((meta.homeVal / total) * barMaxHalfW));

        ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
        ctx.beginPath();
        ctx.roundRect(centerX - barMaxHalfW - 6, bannerY + 90, (barMaxHalfW + 6) * 2, 10, [5]);
        ctx.fill();

        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(centerX - 4 - awayBarW, bannerY + 90, awayBarW, 10, [5]);
        ctx.fill();

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(centerX + 4, bannerY + 90, homeBarW, 10, [5]);
        ctx.fill();

        // Home Team Logo & Name (Right)
        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bannerX + bannerW - 18, bannerY + 16, 6, bannerH - 32, [3]);
        ctx.fill();

        const homeImg = homeLogoImgRef.current;
        if (homeImg && homeImg.complete && homeImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(bannerX + bannerW - 52, bannerY + 66, 24, 0, Math.PI * 2);
          ctx.clip();
          try {
            ctx.drawImage(homeImg, bannerX + bannerW - 76, bannerY + 42, 48, 48);
          } catch {}
          ctx.restore();
        } else {
          ctx.fillStyle = homeColor;
          ctx.beginPath();
          ctx.arc(bannerX + bannerW - 52, bannerY + 66, 24, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 13px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(homeScorebugName.slice(0, 3), bannerX + bannerW - 52, bannerY + 67);
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 20px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(homeScorebugName, bannerX + bannerW - 86, bannerY + 56);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.fillText(meta.homeSub, bannerX + bannerW - 86, bannerY + 78);

        ctx.restore();
        return;
      }

      const cardW = 780;
      const cardH = 490;
      const cardX = Math.round((width - cardW) / 2);
      const cardY = Math.round((height - cardH) / 2) - 20;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 12;

      ctx.fillStyle = "rgba(11, 18, 32, 0.96)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, [20]);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.stroke();
      ctx.shadowColor = "transparent";

      // Header Banner
      const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
      headerGrad.addColorStop(0, awayColor);
      headerGrad.addColorStop(0.5, "#0f172a");
      headerGrad.addColorStop(1, homeColor);
      ctx.fillStyle = headerGrad;
      ctx.beginPath();
      ctx.roundRect(cardX + 4, cardY + 4, cardW - 8, 86, [16, 16, 4, 4]);
      ctx.fill();

      // Center League Logo & Title in Header
      const leagueImg = transitionLogoImgRef.current;
      if (leagueImg && leagueImg.complete && leagueImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cardX + cardW / 2, cardY + 32, 20, 0, Math.PI * 2);
        ctx.clip();
        try {
          ctx.drawImage(leagueImg, cardX + cardW / 2 - 20, cardY + 12, 40, 40);
        } catch {}
        ctx.restore();
      }
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 13px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${(activeLeague?.name || "BOX SCORE").toUpperCase()} • TEAM COMPARISON`,
        cardX + cardW / 2,
        cardY + 62
      );
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "800 11px 'Inter', sans-serif";
      ctx.fillText(
        `${getPeriodLabel(period)} • ${formatClock(clockSeconds)}`,
        cardX + cardW / 2,
        cardY + 79
      );

      // Left (Away) Team Header Info
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 22px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(awayScorebugName, cardX + 26, cardY + 36);
      ctx.font = "700 12px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(awayTeamName.slice(0, 22).toUpperCase(), cardX + 26, cardY + 60);

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 38px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(awayScore), cardX + 245, cardY + 48);

      // Right (Home) Team Header Info
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 22px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(homeScorebugName, cardX + cardW - 26, cardY + 36);
      ctx.font = "700 12px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(homeTeamName.slice(0, 22).toUpperCase(), cardX + cardW - 26, cardY + 60);

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 38px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(homeScore), cardX + cardW - 245, cardY + 48);

      // Stat Comparison Rows
      const rows: Array<{
        label: string;
        awayText: string;
        homeText: string;
        awayVal: number;
        homeVal: number;
      }> = [
        {
          label: "FIELD GOALS",
          awayText: `${teamComparisonStats.away.fgm}/${teamComparisonStats.away.fga} (${teamComparisonStats.away.fgPct}%)`,
          homeText: `${teamComparisonStats.home.fgm}/${teamComparisonStats.home.fga} (${teamComparisonStats.home.fgPct}%)`,
          awayVal: teamComparisonStats.away.fgPct,
          homeVal: teamComparisonStats.home.fgPct,
        },
        {
          label: "3-POINT FG",
          awayText: `${teamComparisonStats.away.tpm}/${teamComparisonStats.away.tpa} (${teamComparisonStats.away.tpPct}%)`,
          homeText: `${teamComparisonStats.home.tpm}/${teamComparisonStats.home.tpa} (${teamComparisonStats.home.tpPct}%)`,
          awayVal: teamComparisonStats.away.tpPct,
          homeVal: teamComparisonStats.home.tpPct,
        },
        {
          label: "FREE THROWS",
          awayText: `${teamComparisonStats.away.ftm}/${teamComparisonStats.away.fta} (${teamComparisonStats.away.ftPct}%)`,
          homeText: `${teamComparisonStats.home.ftm}/${teamComparisonStats.home.fta} (${teamComparisonStats.home.ftPct}%)`,
          awayVal: teamComparisonStats.away.ftPct,
          homeVal: teamComparisonStats.home.ftPct,
        },
        {
          label: "TOTAL REBOUNDS (OREB)",
          awayText: `${teamComparisonStats.away.reb} (${teamComparisonStats.away.oreb})`,
          homeText: `${teamComparisonStats.home.reb} (${teamComparisonStats.home.oreb})`,
          awayVal: teamComparisonStats.away.reb,
          homeVal: teamComparisonStats.home.reb,
        },
        {
          label: "ASSISTS",
          awayText: String(teamComparisonStats.away.ast),
          homeText: String(teamComparisonStats.home.ast),
          awayVal: teamComparisonStats.away.ast,
          homeVal: teamComparisonStats.home.ast,
        },
        {
          label: "STEALS / BLOCKS",
          awayText: `${teamComparisonStats.away.stl} STL • ${teamComparisonStats.away.blk} BLK`,
          homeText: `${teamComparisonStats.home.stl} STL • ${teamComparisonStats.home.blk} BLK`,
          awayVal: teamComparisonStats.away.stl + teamComparisonStats.away.blk,
          homeVal: teamComparisonStats.home.stl + teamComparisonStats.home.blk,
        },
        {
          label: "TURNOVERS / TEAM FOULS",
          awayText: `${teamComparisonStats.away.tov} TOV • ${teamComparisonStats.away.fouls} PF`,
          homeText: `${teamComparisonStats.home.tov} TOV • ${teamComparisonStats.home.fouls} PF`,
          awayVal: teamComparisonStats.away.tov,
          homeVal: teamComparisonStats.home.tov,
        },
      ];

      const startY = cardY + 112;
      const rowStep = 52;
      const barMaxHalfW = 175;
      const centerX = cardX + cardW / 2;

      rows.forEach((r, idx) => {
        const ry = startY + idx * rowStep;
        ctx.fillStyle =
          idx % 2 === 0 ? "rgba(30, 41, 59, 0.55)" : "rgba(15, 23, 42, 0.55)";
        ctx.beginPath();
        ctx.roundRect(cardX + 20, ry, cardW - 40, 42, [8]);
        ctx.fill();

        // Center Category Label
        ctx.fillStyle = "#94a3b8";
        ctx.font = "900 11px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(r.label, centerX, ry + 14);

        // Proportional comparison bars under label
        const total = Math.max(1, r.awayVal + r.homeVal);
        const awayBarW =
          r.awayVal === 0 && r.homeVal === 0
            ? barMaxHalfW * 0.25
            : Math.max(6, Math.round((r.awayVal / total) * barMaxHalfW));
        const homeBarW =
          r.awayVal === 0 && r.homeVal === 0
            ? barMaxHalfW * 0.25
            : Math.max(6, Math.round((r.homeVal / total) * barMaxHalfW));

        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(centerX - 6 - awayBarW, ry + 27, awayBarW, 6, [3]);
        ctx.fill();

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(centerX + 6, ry + 27, homeBarW, 6, [3]);
        ctx.fill();

        // Away Value (Left)
        ctx.fillStyle = r.awayVal >= r.homeVal ? "#ffffff" : "#cbd5e1";
        ctx.font = "900 16px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(r.awayText, cardX + 36, ry + 21);

        // Home Value (Right)
        ctx.fillStyle = r.homeVal >= r.awayVal ? "#ffffff" : "#cbd5e1";
        ctx.font = "900 16px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(r.homeText, cardX + cardW - 36, ry + 21);
      });

      ctx.restore();
    },
    [
      teamComparisonStatKey,
      isAwayInPenalty,
      isHomeInPenalty,
      awayColor,
      homeColor,
      activeLeague?.name,
      period,
      clockSeconds,
      awayScorebugName,
      awayTeamName,
      awayScore,
      homeScorebugName,
      homeTeamName,
      homeScore,
      teamComparisonStats,
    ]
  );

  // Helper: Draw Broadcast Top Performer Per Team Layer (Side-by-Side Away vs Home Leaders)
  const drawTopPerformersOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!awayTopPerformer && !homeTopPerformer) return;

      const cardW = 860;
      const cardH = 158;
      const cardX = Math.round((width - cardW) / 2);
      const cardY = height - 252; // Positioned above bottom scorebug
      const centerX = cardX + cardW / 2;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.78)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;

      ctx.fillStyle = "rgba(11, 18, 32, 0.96)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, [18]);
      ctx.fill();

      const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
      borderGrad.addColorStop(0, awayColor);
      borderGrad.addColorStop(0.5, "rgba(251, 191, 36, 0.65)");
      borderGrad.addColorStop(1, homeColor);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = borderGrad;
      ctx.stroke();
      ctx.shadowColor = "transparent";

      // Header Ribbon
      const headerGrad = ctx.createLinearGradient(cardX + 4, cardY + 4, cardX + cardW - 4, cardY + 4);
      headerGrad.addColorStop(0, awayColor);
      headerGrad.addColorStop(0.5, "#0f172a");
      headerGrad.addColorStop(1, homeColor);
      ctx.fillStyle = headerGrad;
      ctx.beginPath();
      ctx.roundRect(cardX + 4, cardY + 4, cardW - 8, 32, [14, 14, 4, 4]);
      ctx.fill();

      const criterionLabel =
        topPerformerCriterion === "PTS"
          ? "SCORING LEADERS"
          : topPerformerCriterion === "REB"
          ? "REBOUNDING LEADERS"
          : topPerformerCriterion === "AST"
          ? "ASSIST LEADERS"
          : "TOP PERFORMERS";

      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 12px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `★ ${(activeLeague?.name || "BOX SCORE").toUpperCase()} • ${criterionLabel} PER TEAM ★`,
        centerX,
        cardY + 20
      );

      // Center vertical divider
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, cardY + 42);
      ctx.lineTo(centerX, cardY + cardH - 12);
      ctx.stroke();

      const drawPlayerSide = (
        player: typeof awayTopPerformer | typeof homeTopPerformer,
        imgRef: React.MutableRefObject<HTMLImageElement | null>,
        teamLogoRef: React.MutableRefObject<HTMLImageElement | null>,
        teamShort: string,
        teamColorHex: string,
        sideX: number,
        sideW: number
      ) => {
        if (!player) return;
        const bodyY = cardY + 42;
        const avatarCX = sideX + 46;
        const avatarCY = bodyY + 54;
        const avatarR = 32;

        // Player Portrait Circle
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
        ctx.fill();

        const pImg = imgRef.current;
        if (pImg && pImg.complete && pImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarCX, avatarCY, avatarR - 2, 0, Math.PI * 2);
          ctx.clip();
          try {
            ctx.drawImage(pImg, avatarCX - avatarR + 2, avatarCY - avatarR + 2, (avatarR - 2) * 2, (avatarR - 2) * 2);
          } catch {}
          ctx.restore();
        } else {
          ctx.fillStyle = teamColorHex;
          ctx.beginPath();
          ctx.arc(avatarCX, avatarCY, avatarR - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 18px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`#${player.jerseyNumber}`, avatarCX, avatarCY);
        }

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = teamColorHex;
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
        ctx.stroke();

        // Small Team Logo Badge on Avatar Corner
        const tImg = teamLogoRef.current;
        if (tImg && tImg.complete && tImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarCX + 22, avatarCY + 22, 11, 0, Math.PI * 2);
          ctx.fillStyle = "#0f172a";
          ctx.fill();
          ctx.clip();
          try {
            ctx.drawImage(tImg, avatarCX + 11, avatarCY + 11, 22, 22);
          } catch {}
          ctx.restore();
        }

        // Player Name & Team/Position Meta
        const infoX = sideX + 90;
        ctx.fillStyle = "#38bdf8";
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `${teamShort} • #${player.jerseyNumber} • ${player.position || "PLAYER"}`,
          infoX,
          bodyY + 18
        );

        const fullName = `${player.firstName} ${player.lastName}`.trim().toUpperCase();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 17px 'Inter', sans-serif";
        ctx.fillText(fullName.slice(0, 22), infoX, bodyY + 38);

        // Stat Pills Row (PTS, REB, AST, FG, STL/BLK)
        const reb = (player.oreb || 0) + (player.dreb || 0);
        const fgText = `${player.fgm || 0}/${player.fga || 0}`;
        const pills: Array<{ label: string; value: string; highlight?: boolean }> = [
          {
            label: "PTS",
            value: String(player.points || 0),
            highlight: topPerformerCriterion === "OVERALL" || topPerformerCriterion === "PTS",
          },
          {
            label: "REB",
            value: String(reb),
            highlight: topPerformerCriterion === "REB",
          },
          {
            label: "AST",
            value: String(player.ast || 0),
            highlight: topPerformerCriterion === "AST",
          },
          {
            label: "FG",
            value: fgText,
          },
          {
            label: "STL/BLK",
            value: `${player.stl || 0}/${player.blk || 0}`,
          },
        ];

        const pillW = 60;
        const pillH = 44;
        const pillGap = 6;
        const pillY = bodyY + 54;

        pills.forEach((pill, idx) => {
          const px = infoX + idx * (pillW + pillGap);
          if (px + pillW > sideX + sideW - 8) return;
          ctx.fillStyle = pill.highlight
            ? "rgba(225, 29, 72, 0.28)"
            : "rgba(30, 41, 59, 0.85)";
          ctx.beginPath();
          ctx.roundRect(px, pillY, pillW, pillH, [8]);
          ctx.fill();

          ctx.lineWidth = 1;
          ctx.strokeStyle = pill.highlight
            ? "rgba(251, 113, 133, 0.65)"
            : "rgba(148, 163, 184, 0.25)";
          ctx.stroke();

          ctx.fillStyle = pill.highlight ? "#fda4af" : "#94a3b8";
          ctx.font = "800 9px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(pill.label, px + pillW / 2, pillY + 13);

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 15px 'Inter', sans-serif";
          ctx.fillText(pill.value, px + pillW / 2, pillY + 31);
        });
      };

      drawPlayerSide(
        awayTopPerformer,
        awayTopPerformerImgRef,
        awayLogoImgRef,
        awayScorebugName,
        awayColor,
        cardX + 8,
        cardW / 2 - 12
      );
      drawPlayerSide(
        homeTopPerformer,
        homeTopPerformerImgRef,
        homeLogoImgRef,
        homeScorebugName,
        homeColor,
        centerX + 4,
        cardW / 2 - 12
      );

      ctx.restore();
    },
    [
      awayTopPerformer,
      homeTopPerformer,
      awayColor,
      homeColor,
      topPerformerCriterion,
      activeLeague?.name,
      awayScorebugName,
      homeScorebugName,
    ]
  );

  // Helper: Draw Uploaded Advertisement Image Overlay in Selected Broadcast Position
  const drawAdvertisementOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!activeAdItem) return;
      const adImg = adImgCacheRef.current[activeAdItem.id];
      if (!adImg || !adImg.complete || adImg.naturalWidth === 0) return;

      ctx.save();

      if (adOverlayLayout === "fullscreen_commercial") {
        // Fullscreen Broadcast Commercial / Ad Break Graphic
        ctx.fillStyle = "#090d16";
        ctx.fillRect(0, 0, width, height);

        const scale = Math.min(
          width / adImg.naturalWidth,
          height / adImg.naturalHeight
        );
        const dw = adImg.naturalWidth * scale;
        const dh = adImg.naturalHeight * scale;
        ctx.drawImage(adImg, (width - dw) / 2, (height - dh) / 2, dw, dh);

        // Top-right SPONSORED badge
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.beginPath();
        ctx.roundRect(width - 230, 24, 194, 34, [8]);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.font = "900 12px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`📢 SPONSOR • ${activeAdItem.name.slice(0, 14).toUpperCase()}`, width - 133, 41);
        ctx.restore();
        return;
      }

      let boxX = width - 380;
      let boxY = height - 245;
      let boxW = 340;
      let boxH = 195;

      if (adOverlayLayout === "top_right_card") {
        boxW = 340;
        boxH = 195;
        boxX = width - boxW - 36;
        boxY = 72;
      } else if (adOverlayLayout === "top_left_card") {
        boxW = 340;
        boxH = 195;
        boxX = 36;
        boxY = scorebugPosition === "top_corner" ? 164 : 36;
      } else if (adOverlayLayout === "bottom_right_card") {
        boxW = 340;
        boxH = 195;
        boxX = width - boxW - 36;
        boxY = scorebugPosition === "bottom_bar" ? height - boxH - 125 : height - boxH - 28;
      } else if (adOverlayLayout === "bottom_center_banner") {
        boxW = 760;
        boxH = 118;
        boxX = Math.round((width - boxW) / 2);
        boxY = scorebugPosition === "bottom_bar" ? height - boxH - 122 : height - boxH - 26;
      }

      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 6;

      ctx.fillStyle = "rgba(11, 18, 32, 0.94)";
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, [14]);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(251, 191, 36, 0.6)";
      ctx.stroke();
      ctx.shadowColor = "transparent";

      // Clip inside rounded card & draw advertisement image fitted cleanly
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(boxX + 4, boxY + 4, boxW - 8, boxH - 8, [10]);
      ctx.clip();

      const innerW = boxW - 8;
      const innerH = boxH - 8;
      const scale = Math.min(
        innerW / adImg.naturalWidth,
        innerH / adImg.naturalHeight
      );
      const dw = adImg.naturalWidth * scale;
      const dh = adImg.naturalHeight * scale;
      ctx.drawImage(
        adImg,
        boxX + 4 + (innerW - dw) / 2,
        boxY + 4 + (innerH - dh) / 2,
        dw,
        dh
      );
      ctx.restore();

      // Small "SPONSOR" tag pill on top-left corner of ad card
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(boxX + 10, boxY + 8, 76, 18, [5]);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 9px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SPONSOR", boxX + 48, boxY + 17);

      ctx.restore();
    },
    [activeAdItem, adOverlayLayout, scorebugPosition]
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

  // Render any StudioScene onto a target Canvas (used for Left Preview, Right Live Program & Clean Raw Recording)
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
        // Render Slow-Motion Replay Scene (Raw Camera Footage — Scorebug is NEVER drawn on Replays!)
        const cfg = scene.replayConfig;
        const replaySourceVideo =
          storedVideos.find((v) => v.id === cfg.videoId) ??
          (cfg.cameraId ? resolveStoredVideoForCamera(cfg.cameraId) : null);
        const startSec = cfg.startSec || 0;
        const endSec = Math.max(startSec + 0.5, cfg.endSec || 10);
        const rate = cfg.playbackRate || 0.5;
        const clipSpan = Math.max(0.5, endSec - startSec);
        const syntheticLoopSec =
          startSec + (((nowMs / 1000) * rate) % clipSpan);

        const hasPlayableVideo =
          Boolean(replaySourceVideo && replaySourceVideo.sizeBytes > 1000) &&
          Boolean(
            replayVidEl &&
              replayVidEl.readyState >= 2 &&
              replayVidEl.videoWidth > 0
          );

        const currentClipSec =
          hasPlayableVideo &&
          replayVidEl &&
          !Number.isNaN(replayVidEl.currentTime)
            ? replayVidEl.currentTime
            : syntheticLoopSec;

        const candidateFrames =
          replaySourceVideo?.timelineFrames?.length
            ? replaySourceVideo.timelineFrames
            : cfg.cameraId &&
                liveCaptureFramesByCamRef.current[cfg.cameraId]?.length
              ? liveCaptureFramesByCamRef.current[cfg.cameraId]
              : cfg.cameraId &&
                  rollingFramesByCamRef.current[cfg.cameraId]?.length
                ? rollingFramesByCamRef.current[cfg.cameraId]
                : [];

        let bestFrame: TimelineFrame | null = null;
        if (candidateFrames.length > 0) {
          bestFrame = candidateFrames[0];
          let bestDiff = Math.abs(bestFrame.timeSec - currentClipSec);
          for (const f of candidateFrames) {
            const d = Math.abs(f.timeSec - currentClipSec);
            if (d < bestDiff) {
              bestFrame = f;
              bestDiff = d;
            }
          }
        }

        let drewReplayFrame = false;
        if (hasPlayableVideo && replayVidEl) {
          ctx.drawImage(replayVidEl, 0, 0, width, height);
          drewReplayFrame = true;
        } else if (bestFrame?.dataUrl) {
          let frameImg = replayFrameImgCacheRef.current[bestFrame.dataUrl];
          if (!frameImg) {
            frameImg = new Image();
            frameImg.src = bestFrame.dataUrl;
            replayFrameImgCacheRef.current[bestFrame.dataUrl] = frameImg;
          }
          if (frameImg.complete && frameImg.naturalWidth > 0) {
            ctx.drawImage(frameImg, 0, 0, width, height);
            drewReplayFrame = true;
          }
        }

        if (
          !drewReplayFrame &&
          cfg.cameraId &&
          cfg.cameraId !== "clean_program" &&
          cameraRawCanvasByKeyRef.current[cfg.cameraId]
        ) {
          ctx.drawImage(
            cameraRawCanvasByKeyRef.current[cfg.cameraId],
            0,
            0,
            width,
            height
          );
          drewReplayFrame = true;
        }

        if (!drewReplayFrame) {
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#f59e0b";
          ctx.font = "900 28px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `LOADING REPLAY CLIP: ${cfg.videoTitle}`,
            width / 2,
            height / 2
          );
        }

        // Broadcast Slow-Motion Instant Replay Banner (Top-Left)
        const camTag = cfg.cameraLabel
          ? ` • ${cfg.cameraLabel.toUpperCase()}`
          : "";
        const bannerText = `⚡ INSTANT REPLAY (${cfg.playbackRate}x SLOW-MO)${camTag} • ${formatClock(
          cfg.startSec
        )}-${formatClock(cfg.endSec)}`;
        ctx.save();
        ctx.font = "900 16px 'Inter', sans-serif";
        const bannerW = Math.max(400, Math.min(760, ctx.measureText(bannerText).width + 44));
        ctx.fillStyle = "rgba(225, 29, 72, 0.92)";
        ctx.beginPath();
        ctx.roundRect(36, 24, bannerW, 44, [10]);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(bannerText, 54, 46);
        ctx.restore();

        // Optional Buzzer-Beater / Official Review Game Clock Overlay on Replay (No Scorebug!)
        const shouldShowReplayClock =
          cfg.showGameClock !== undefined
            ? cfg.showGameClock
            : showReplayGameClock;

        if (shouldShowReplayClock) {
          const syncedGameClockLabel =
            bestFrame?.gameClockLabel ||
            `${getPeriodLabel(period)} ${formatClock(clockSeconds)}`;

          // Render Official Review / Buzzer-Beater Game Clock Box at Bottom-Right
          const hudW = 340;
          const hudH = 84;
          const hudX = width - hudW - 36;
          const hudY = height - hudH - 28;

          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 6;

          ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
          ctx.beginPath();
          ctx.roundRect(hudX, hudY, hudW, hudH, [14]);
          ctx.fill();

          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#f59e0b";
          ctx.stroke();
          ctx.shadowColor = "transparent";

          // Left Amber Accent Strip
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.roundRect(hudX + 8, hudY + 10, 6, hudH - 20, [3]);
          ctx.fill();

          ctx.fillStyle = "#fbbf24";
          ctx.font = "900 11px 'Inter', sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(
            "⏱️ OFFICIAL REPLAY GAME CLOCK",
            hudX + 24,
            hudY + 23
          );

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 32px 'Inter', sans-serif";
          ctx.fillText(syncedGameClockLabel, hudX + 24, hudY + 56);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "700 12px 'Inter', sans-serif";
          ctx.textAlign = "right";
          ctx.fillText(
            `Rec ${formatPreciseTime(currentClipSec)}`,
            hudX + hudW - 16,
            hudY + 23
          );
          ctx.restore();
        }
        return;
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
        drawOverlay &&
        isLiveProgramCanvas &&
        featuredOnCourtPlayer &&
        !isPictureOrVideoScene
      ) {
        drawLivePlayerStatsOverlay(ctx, width, height);
      }

      // Render Team Comparison Stats Overlay when toggled ON
      if (drawOverlay && showTeamComparisonOverlay && !isPictureOrVideoScene) {
        drawTeamComparisonOverlay(ctx, width, height);
      }

      // Render Top Performer Per Team Layer when toggled ON
      if (drawOverlay && showTopPerformersOverlay && !isPictureOrVideoScene) {
        drawTopPerformersOverlay(ctx, width, height);
      }

      // Render Advertisement Image Overlay when toggled ON
      if (drawOverlay && showAdOverlay && activeAdItem) {
        drawAdvertisementOverlay(ctx, width, height);
      }
    },
    [
      drawCameraSlotRect,
      drawScorebugOverlay,
      drawLivePlayerStatsOverlay,
      drawTeamComparisonOverlay,
      drawTopPerformersOverlay,
      drawAdvertisementOverlay,
      featuredOnCourtPlayer,
      scorebugPosition,
      showReplayGameClock,
      storedVideos,
      resolveStoredVideoForCamera,
      period,
      clockSeconds,
      showTeamComparisonOverlay,
      showTopPerformersOverlay,
      showAdOverlay,
      activeAdItem,
    ]
  );

  // Helper: Draw 100% Solid Opaque Broadcast Transitions on Live Program Canvas (Slash Wipe, Split Doors, Diamond Shield Burst & Solid Curtain)
  const drawLogoStingerOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      progress: number,
      design: "slash_wipe" | "split_doors" | "diamond_burst" | "curtain_wipe" = "slash_wipe"
    ) => {
      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      // Helper to draw a 100% solid, crisp, high-contrast League / Box Score Medallion at (cx, cy)
      const drawSolidLogoMedallion = (
        cx: number,
        cy: number,
        radius: number
      ) => {
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Outer Solid Gold Championship Ring
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 22, 0, Math.PI * 2);
        ctx.fill();

        // Middle Solid Crimson Ring
        ctx.fillStyle = "#e11d48";
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 14, 0, Math.PI * 2);
        ctx.fill();

        // Dark Broadcast Bezel Ring
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
        ctx.fill();

        const logoImg = transitionLogoImgRef.current;
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
          // Solid Pure White Plate so dark/colored logo artwork has 100% crisp contrast and zero transparency
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
          ctx.clip();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          const maxDim = (radius - 6) * 2;
          const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
          let dw = maxDim;
          let dh = maxDim;
          if (aspect > 1) {
            dh = maxDim / aspect;
          } else {
            dw = maxDim * aspect;
          }
          ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh);
          ctx.restore();
        } else {
          // Solid Fallback League / Box Score Broadcast Emblem
          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.font = "900 42px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            (activeLeague?.name || "BOX SCORE").slice(0, 12).toUpperCase(),
            cx,
            cy - 10
          );
          ctx.fillStyle = "#f59e0b";
          ctx.font = "800 18px 'Inter', sans-serif";
          ctx.fillText("OFFICIAL BROADCAST", cx, cy + 28);
        }

        // Solid Championship Banner Plate under the Medallion
        const bannerW = 340;
        const bannerH = 40;
        const bannerY = cy + radius + 34;
        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(cx - bannerW / 2, bannerY, bannerW, bannerH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 17px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          (activeLeague?.name || "LIVE BROADCAST").slice(0, 24).toUpperCase(),
          cx,
          bannerY + bannerH / 2 + 1
        );

        ctx.restore();
      };

      ctx.save();
      ctx.globalAlpha = 1.0;

      if (design === "split_doors") {
        // DESIGN 2: ARENA SHUTTER SPLIT DOORS (Left & Right Solid Gates Slam Shut & Lock Logo in Center)
        let closeT = 0;
        if (progress < 0.43) {
          closeT = easeOutCubic(progress / 0.43);
        } else if (progress <= 0.57) {
          closeT = 1;
        } else {
          closeT = 1 - easeInOutCubic((progress - 0.57) / 0.43);
        }
        closeT = Math.max(0, Math.min(1, closeT));

        const halfW = width / 2;
        const leftDoorRightX = Math.round(halfW * closeT);
        const rightDoorLeftX = Math.round(width - halfW * closeT);
        const cy = height / 2;
        const logoRadius = 135;

        // 1. LEFT ARENA DOOR (0 -> leftDoorRightX)
        if (leftDoorRightX > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, leftDoorRightX, height);
          ctx.clip();

          // Solid Deep Broadcast Navy Door Panel
          ctx.fillStyle = "#0b172a";
          ctx.fillRect(0, 0, leftDoorRightX, height);

          // Solid Angled Crimson & Sky Blue Arena Chevrons anchored to Door Edge
          ctx.fillStyle = "#e11d48";
          ctx.beginPath();
          ctx.moveTo(leftDoorRightX - 420, 0);
          ctx.lineTo(leftDoorRightX - 270, 0);
          ctx.lineTo(leftDoorRightX - 150, height / 2);
          ctx.lineTo(leftDoorRightX - 270, height);
          ctx.lineTo(leftDoorRightX - 420, height);
          ctx.lineTo(leftDoorRightX - 300, height / 2);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#0284c7";
          ctx.beginPath();
          ctx.moveTo(leftDoorRightX - 230, 0);
          ctx.lineTo(leftDoorRightX - 150, 0);
          ctx.lineTo(leftDoorRightX - 30, height / 2);
          ctx.lineTo(leftDoorRightX - 150, height);
          ctx.lineTo(leftDoorRightX - 230, height);
          ctx.lineTo(leftDoorRightX - 110, height / 2);
          ctx.closePath();
          ctx.fill();

          // Gold Center Lock Seam Bar on Left Door
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(leftDoorRightX - 14, 0, 14, height);

          // Left Half of Logo Medallion rides on Left Door Edge
          drawSolidLogoMedallion(leftDoorRightX, cy, logoRadius);
          ctx.restore();
        }

        // 2. RIGHT ARENA DOOR (rightDoorLeftX -> width)
        if (rightDoorLeftX < width) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(rightDoorLeftX, 0, width - rightDoorLeftX, height);
          ctx.clip();

          // Solid Deep Broadcast Navy Door Panel
          ctx.fillStyle = "#0b172a";
          ctx.fillRect(rightDoorLeftX, 0, width - rightDoorLeftX, height);

          // Solid Angled Gold & Crimson Arena Chevrons anchored to Right Door Edge
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.moveTo(rightDoorLeftX + 420, 0);
          ctx.lineTo(rightDoorLeftX + 270, 0);
          ctx.lineTo(rightDoorLeftX + 150, height / 2);
          ctx.lineTo(rightDoorLeftX + 270, height);
          ctx.lineTo(rightDoorLeftX + 420, height);
          ctx.lineTo(rightDoorLeftX + 300, height / 2);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#e11d48";
          ctx.beginPath();
          ctx.moveTo(rightDoorLeftX + 230, 0);
          ctx.lineTo(rightDoorLeftX + 150, 0);
          ctx.lineTo(rightDoorLeftX + 30, height / 2);
          ctx.lineTo(rightDoorLeftX + 150, height);
          ctx.lineTo(rightDoorLeftX + 230, height);
          ctx.lineTo(rightDoorLeftX + 110, height / 2);
          ctx.closePath();
          ctx.fill();

          // Gold Center Lock Seam Bar on Right Door
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(rightDoorLeftX, 0, 14, height);

          // Right Half of Logo Medallion rides on Right Door Edge
          drawSolidLogoMedallion(rightDoorLeftX, cy, logoRadius);
          ctx.restore();
        }
      } else if (design === "diamond_burst") {
        // DESIGN 3: GEOMETRIC SHIELD / DIAMOND BURST (Expands from Center to Cover 100%, then Collapses)
        let burstT = 0;
        if (progress < 0.44) {
          burstT = easeOutCubic(progress / 0.44);
        } else if (progress <= 0.56) {
          burstT = 1;
        } else {
          burstT = 1 - easeInOutCubic((progress - 0.56) / 0.44);
        }
        burstT = Math.max(0, Math.min(1, burstT));

        if (burstT > 0.005) {
          const cx = width / 2;
          const cy = height / 2;
          const coreRx = 2200 * burstT;
          const coreRy = 1260 * burstT;

          const drawSolidDiamond = (rx: number, ry: number, color: string) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx, cy - ry);
            ctx.lineTo(cx + rx, cy);
            ctx.lineTo(cx, cy + ry);
            ctx.lineTo(cx - rx, cy);
            ctx.closePath();
            ctx.fill();
          };

          // Outer Championship Gold Diamond Ring
          drawSolidDiamond(coreRx + 240, coreRy + 135, "#f59e0b");
          // Middle Crimson Diamond Ring
          drawSolidDiamond(coreRx + 160, coreRy + 90, "#e11d48");
          // Inner Broadcast Blue Diamond Ring
          drawSolidDiamond(coreRx + 80, coreRy + 45, "#0284c7");
          // Core Deep Broadcast Navy Diamond
          drawSolidDiamond(coreRx, coreRy, "#0b172a");

          // Clip strictly inside the Core Diamond so the Logo & Inner Accents are 100% solid and never bleed
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(cx, cy - coreRy);
          ctx.lineTo(cx + coreRx, cy);
          ctx.lineTo(cx, cy + coreRy);
          ctx.lineTo(cx - coreRx, cy);
          ctx.closePath();
          ctx.clip();

          // Solid Inner Geometric Ring Accents
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 420);
          ctx.lineTo(cx + 740, cy);
          ctx.lineTo(cx, cy + 420);
          ctx.lineTo(cx - 740, cy);
          ctx.closePath();
          ctx.stroke();

          const logoScale = 0.85 + 0.15 * Math.min(1, burstT * 1.4);
          drawSolidLogoMedallion(cx, cy - 12, Math.round(135 * logoScale));
          ctx.restore();
        }
      } else if (design === "curtain_wipe") {
        // SOLID BROADCAST CURTAIN WIPE (Used by FADE / CURTAIN button — 100% Non-Transparent!)
        const ease = easeInOutCubic(progress);
        const slant = 90;
        const coreWidth = width + slant * 2 + 280;
        const totalSpan = width * 2 + slant * 2 + 520;
        const midX = width / 2 + (ease - 0.5) * totalSpan;

        const drawBand = (offsetX: number, bw: number, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(offsetX - bw / 2 + slant, 0);
          ctx.lineTo(offsetX + bw / 2 + slant, 0);
          ctx.lineTo(offsetX + bw / 2 - slant, height);
          ctx.lineTo(offsetX - bw / 2 - slant, height);
          ctx.closePath();
          ctx.fill();
        };

        drawBand(midX - coreWidth / 2 - 90, 180, "#f59e0b");
        drawBand(midX + coreWidth / 2 + 90, 180, "#f59e0b");
        drawBand(midX, coreWidth, "#090d16");
      } else {
        // DESIGN 1 (DEFAULT): DIAGONAL SLASH LOGO WIPE (100% Solid Opaque)
        const ease = easeInOutCubic(progress);
        const slant = 200;
        const coreWidth = width + slant * 2 + 440;
        const totalSpan = width * 2 + slant * 2 + 960;
        const midX = width / 2 + (ease - 0.5) * totalSpan;

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

        // Trailing & Leading Solid Ribbons
        drawAngledBand(midX - coreWidth / 2 - 220, 200, "#e11d48");
        drawAngledBand(midX - coreWidth / 2 - 70, 140, "#f59e0b");
        drawAngledBand(midX + coreWidth / 2 + 220, 200, "#f59e0b");
        drawAngledBand(midX + coreWidth / 2 + 70, 140, "#0284c7");

        // Main Solid Deep Broadcast Navy Core Polygon
        drawAngledBand(midX, coreWidth, "#0b172a");

        // Clip strictly inside the Solid Core Polygon so the Logo Medallion is 100% opaque and never floats over video
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(midX - coreWidth / 2 + slant, 0);
        ctx.lineTo(midX + coreWidth / 2 + slant, 0);
        ctx.lineTo(midX + coreWidth / 2 - slant, height);
        ctx.lineTo(midX - coreWidth / 2 - slant, height);
        ctx.closePath();
        ctx.clip();

        // Solid Diagonal Sport Stripe Accents inside Core
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(midX - 420 + slant, 0);
        ctx.lineTo(midX - 420 - slant, height);
        ctx.moveTo(midX + 420 + slant, 0);
        ctx.lineTo(midX + 420 - slant, height);
        ctx.stroke();

        // Crisp 100% Solid Center Logo Medallion
        drawSolidLogoMedallion(width / 2, height / 2 - 12, 135);
        ctx.restore();
      }

      ctx.restore();
    },
    [activeLeague?.name]
  );

  // Dual-Monitor Continuous Render Loop (Left = Preview Canvas, Right = Live Program Canvas, Clean Raw Program Canvas, Multi-Camera Raw Canvases, + Bottom Scene Preview Strip)
  useEffect(() => {
    let isRunning = true;
    let rafId: number;
    let lastThumbRenderMs = 0;
    let lastCamRawRenderMs = 0;

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

      // 2. Render Right LIVE PROGRAM Canvas (with Scorebug & Overlays for Broadcast)
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

          // Check if Broadcast Stinger / Wipe Transition is active
          const stinger = stingerStateRef.current;
          if (stinger.active) {
            const elapsed = nowMs - stinger.startMs;
            const progress = Math.min(1, Math.max(0, elapsed / stinger.durationMs));
            if (progress >= 0.48 && !stinger.switchedScene) {
              stinger.switchedScene = true;
              setLiveSceneId(stinger.targetSceneId);
            }
            drawLogoStingerOverlay(
              lCtx,
              lCanvas.width,
              lCanvas.height,
              progress,
              stinger.design || "slash_wipe"
            );
            if (progress >= 1) {
              stinger.active = false;
              setIsTransitioning(false);
            }
          }

          // Mirror Live Program Canvas directly to Pop-Out Clean Program Window if open
          const popupWin = cleanPopupWindowRef.current;
          const popupCanvas = cleanPopupCanvasRef.current;
          if (popupWin && !popupWin.closed && popupCanvas) {
            const popCtx = popupCanvas.getContext("2d");
            if (popCtx) {
              popCtx.drawImage(
                lCanvas,
                0,
                0,
                popupCanvas.width,
                popupCanvas.height
              );
            }
          }
        }
      }

      // 2B. Render CLEAN RAW PROGRAM Canvas (NO Scorebug, NO Stats/Ad Overlays — used for Raw Camera Footage Recording & Replays!)
      if (!cleanLiveCanvasRef.current && typeof document !== "undefined") {
        const cleanC = document.createElement("canvas");
        cleanC.width = 1920;
        cleanC.height = 1080;
        if (hiddenVideosContainerRef.current) {
          hiddenVideosContainerRef.current.appendChild(cleanC);
        }
        cleanLiveCanvasRef.current = cleanC;
      }
      const cleanCanvas = cleanLiveCanvasRef.current;
      if (cleanCanvas) {
        const cleanCtx = cleanCanvas.getContext("2d");
        if (cleanCtx) {
          renderSceneToCanvas(
            cleanCtx,
            cleanCanvas.width,
            cleanCanvas.height,
            liveScene,
            liveReplayVideoRef.current,
            liveMediaVideoRef.current,
            false, // NO Scorebug on raw camera recording!
            false, // NO Broadcast overlays on raw camera recording!
            nowMs
          );
        }
      }

      // 2C. Render Individual Multi-Camera Raw Canvases (~15fps) so every camera has its own raw timeline & instant replay buffer
      if (nowMs - lastCamRawRenderMs >= 66 && typeof document !== "undefined") {
        lastCamRawRenderMs = nowMs;
        availableStudioCameras.forEach((camTrack, idx) => {
          if (camTrack.cameraId === "clean_program" || !camTrack.slot) return;
          let camCanvas = cameraRawCanvasByKeyRef.current[camTrack.cameraId];
          if (!camCanvas) {
            camCanvas = document.createElement("canvas");
            camCanvas.width = 1280;
            camCanvas.height = 720;
            if (hiddenVideosContainerRef.current) {
              hiddenVideosContainerRef.current.appendChild(camCanvas);
            }
            cameraRawCanvasByKeyRef.current[camTrack.cameraId] = camCanvas;
          }
          const camCtx = camCanvas.getContext("2d");
          if (camCtx) {
            camCtx.fillStyle = "#090d16";
            camCtx.fillRect(0, 0, camCanvas.width, camCanvas.height);
            drawCameraSlotRect(
              camCtx,
              camTrack.slot,
              idx,
              0,
              0,
              camCanvas.width,
              camCanvas.height,
              nowMs
            );
          }
        });
      }

      // 3. Render Miniature Scene Preview Thumbnails in Preview Strip (10fps)
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

      if (typeof document === "undefined" || !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    // Unthrottled Web Worker 30fps ticker + Pop-Out Window RAF so Live Canvas & Clean Feed Pop-Out never freeze when /studio is in a background tab behind the Scorebook tab!
    let bgWorker: Worker | null = null;
    let bgWorkerUrl = "";
    try {
      if (typeof window !== "undefined" && "Worker" in window) {
        const blob = new Blob(
          [
            `const id = setInterval(() => postMessage("tick"), 33); onmessage = (e) => { if (e.data === "stop") clearInterval(id); };`,
          ],
          { type: "application/javascript" }
        );
        bgWorkerUrl = URL.createObjectURL(blob);
        bgWorker = new Worker(bgWorkerUrl);
        bgWorker.onmessage = () => {
          if (!isRunning) return;
          if (
            typeof document !== "undefined" &&
            (document.hidden ||
              Boolean(
                cleanPopupWindowRef.current &&
                  !cleanPopupWindowRef.current.closed
              ))
          ) {
            syncFromLocalStorage();
            tick(performance.now());
          }
        };
      }
    } catch {}

    const fallbackBgTimer = setInterval(() => {
      if (!isRunning) return;
      if (typeof document !== "undefined" && document.hidden) {
        syncFromLocalStorage();
        tick(performance.now());
      }
    }, 100);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && isRunning) {
        syncFromLocalStorage();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      clearInterval(fallbackBgTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (bgWorker) {
        try {
          bgWorker.postMessage("stop");
          bgWorker.terminate();
        } catch {}
      }
      if (bgWorkerUrl) {
        try {
          URL.revokeObjectURL(bgWorkerUrl);
        } catch {}
      }
    };
  }, [
    scenes,
    previewScene,
    liveScene,
    showOverlayInPreview,
    renderSceneToCanvas,
    drawLogoStingerOverlay,
    availableStudioCameras,
    drawCameraSlotRect,
    syncFromLocalStorage,
  ]);

  // Section Order, Visibility & Light/Dark Theme Toggle Handlers
  const handleSwapTopSection = (target?: "timeline" | "scenes_and_live") => {
    setTopSection((prev) => {
      const next = target ?? (prev === "timeline" ? "scenes_and_live" : "timeline");
      try {
        localStorage.setItem("boxscore_studio_top_section", next);
      } catch {}
      return next;
    });
  };

  const toggleShowTimeline = (val?: boolean) => {
    setShowTimeline((prev) => {
      const next = typeof val === "boolean" ? val : !prev;
      try {
        localStorage.setItem("boxscore_studio_show_timeline", String(next));
      } catch {}
      return next;
    });
  };

  const toggleShowScenesAndLive = (val?: boolean) => {
    setShowScenesAndLive((prev) => {
      const next = typeof val === "boolean" ? val : !prev;
      try {
        localStorage.setItem("boxscore_studio_show_scenes_live", String(next));
      } catch {}
      return next;
    });
  };

  const toggleShowPreviewScenesStrip = (val?: boolean) => {
    setShowPreviewScenesStrip((prev) => {
      const next = typeof val === "boolean" ? val : !prev;
      try {
        localStorage.setItem("boxscore_studio_show_preview_scenes", String(next));
      } catch {}
      return next;
    });
  };

  const toggleStudioTheme = (targetTheme?: "dark" | "light") => {
    setStudioTheme((prev) => {
      const next = targetTheme ?? (prev === "dark" ? "light" : "dark");
      try {
        localStorage.setItem("boxscore_studio_theme", next);
        const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
        if (meta) {
          meta.content = next;
        }
        const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
        const systemScheme = prefersDark ? "dark" : "light";
        if (next !== systemScheme) {
          localStorage.setItem("color-scheme", next);
        } else {
          localStorage.removeItem("color-scheme");
        }
      } catch {}
      return next;
    });
  };

  // OBS Transition Actions: CUT, SOLID WIPE & 3 LOGO STINGER DESIGNS
  const handleCutToLive = () => {
    stingerStateRef.current.active = false;
    setIsTransitioning(false);
    setLiveSceneId(previewSceneId);
  };

  const handleLogoTransitionToLive = (
    designOverride?: "slash_wipe" | "split_doors" | "diamond_burst"
  ) => {
    const design =
      designOverride === "slash_wipe" ||
      designOverride === "split_doors" ||
      designOverride === "diamond_burst"
        ? designOverride
        : selectedTransitionDesign;
    if (designOverride) {
      setSelectedTransitionDesign(design);
      try {
        window.localStorage.setItem("boxscore_studio_transition_design", design);
      } catch {}
    }
    stingerStateRef.current = {
      active: true,
      startMs: performance.now(),
      durationMs: transitionDurationMs,
      switchedScene: false,
      targetSceneId: previewSceneId,
      design,
    };
    setIsTransitioning(true);
  };

  const handleFadeToLive = () => {
    stingerStateRef.current = {
      active: true,
      startMs: performance.now(),
      durationMs: transitionDurationMs,
      switchedScene: false,
      targetSceneId: previewSceneId,
      design: "curtain_wipe",
    };
    setIsTransitioning(true);
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

    // Reuse an existing saved or active wireless roomCode if this scene doesn't already use it
    const existingSceneWirelessRooms = new Set(
      previewScene.cameras
        .filter((c) => c.sourceType === "wireless_phone")
        .map((c) => (c.wirelessRoomCode || "").trim().toUpperCase())
    );
    const reusableSaved = savedWirelessCameras.find(
      (w) => !existingSceneWirelessRooms.has(w.roomCode.toUpperCase())
    );
    const reusableRoomFromOtherScene = scenes
      .flatMap((s) => s.cameras)
      .find(
        (c) =>
          c.sourceType === "wireless_phone" &&
          c.wirelessRoomCode &&
          !existingSceneWirelessRooms.has(c.wirelessRoomCode.toUpperCase())
      )?.wirelessRoomCode;

    const roomCode = (
      reusableSaved?.roomCode ||
      reusableRoomFromOtherScene ||
      lastConnectedWirelessRoomRef.current ||
      `CAM${Math.floor(100 + Math.random() * 900)}`
    )
      .trim()
      .toUpperCase();
    const defaultLabel =
      reusableSaved?.name ||
      (platform === "android"
        ? `Android Cam ${nextIdx}`
        : `iPhone Cam ${nextIdx}`);
    const newSlot: SceneCameraSlot = {
      id: slotId,
      label: defaultLabel,
      sourceType: "wireless_phone",
      deviceId: "",
      angleName: defaultLabel.toUpperCase(),
      wirelessRoomCode: roomCode,
      wirelessIpUrl: "",
      wirelessPlatform: reusableSaved?.platform || platform,
      savedWirelessCamId: reusableSaved?.id,
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

  // Capture a small thumbnail + exact Game Clock & Score from Clean Raw Canvas (or specific Camera Canvas) for the Camera Timeline
  const captureLiveTimelineThumbnail = (
    sec: number,
    sourceCanvas?: HTMLCanvasElement | null
  ): TimelineFrame | null => {
    const targetCanvas =
      sourceCanvas || cleanLiveCanvasRef.current || liveCanvasRef.current;
    if (!targetCanvas) return null;
    try {
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 160;
      thumbCanvas.height = 90;
      const tCtx = thumbCanvas.getContext("2d");
      if (!tCtx) return null;
      tCtx.drawImage(targetCanvas, 0, 0, 160, 90);
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

  // Continuous 1fps Rolling Frame Buffer for EVERY Studio Camera (so any camera has instant timeline frames & replay capability even if added mid-game!)
  useEffect(() => {
    const rollingTimer = setInterval(() => {
      const nextRollingSec = rollingElapsedSecRef.current;
      rollingElapsedSecRef.current = (nextRollingSec + 1) % 90;
      const nextMap: Record<string, TimelineFrame[]> = {
        ...rollingFramesByCamRef.current,
      };

      const mainC = cleanLiveCanvasRef.current || liveCanvasRef.current;
      if (mainC) {
        const snapMain = captureLiveTimelineThumbnail(nextRollingSec, mainC);
        if (snapMain) {
          const prev = (nextMap["clean_program"] || []).filter(
            (f) => f.timeSec !== nextRollingSec
          );
          nextMap["clean_program"] = [...prev, snapMain].slice(-90);
        }
      }

      availableStudioCameras.forEach((camTrack) => {
        if (camTrack.cameraId === "clean_program") return;
        const camC = cameraRawCanvasByKeyRef.current[camTrack.cameraId];
        if (!camC) return;
        const snapCam = captureLiveTimelineThumbnail(nextRollingSec, camC);
        if (snapCam) {
          const prev = (nextMap[camTrack.cameraId] || []).filter(
            (f) => f.timeSec !== nextRollingSec
          );
          nextMap[camTrack.cameraId] = [...prev, snapCam].slice(-90);
        }
      });

      rollingFramesByCamRef.current = nextMap;
      setRollingTimelineFramesByCam({ ...nextMap });
    }, 1000);
    return () => clearInterval(rollingTimer);
  }, [availableStudioCameras]);

  // Start Live Recording (Records Clean Raw Program Canvas + Every Individual Camera Track Simultaneously!)
  const startRecording = () => {
    if (!cleanLiveCanvasRef.current && typeof document !== "undefined") {
      const cleanC = document.createElement("canvas");
      cleanC.width = 1920;
      cleanC.height = 1080;
      if (hiddenVideosContainerRef.current) {
        hiddenVideosContainerRef.current.appendChild(cleanC);
      }
      cleanLiveCanvasRef.current = cleanC;
    }
    const primaryRawCanvas = cleanLiveCanvasRef.current || liveCanvasRef.current;
    if (!primaryRawCanvas) return;

    try {
      const recordingSessionId = `recsess-${generateUUID().slice(0, 8)}`;
      activeRecordingSessionIdRef.current = recordingSessionId;
      const canvasStream = primaryRawCanvas.captureStream(30);
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
      const camMimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : mimeType;

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 4_500_000,
      });

      recordedChunksRef.current = [];
      liveCaptureFramesRef.current = [];
      setLiveRecordingFrames([]);
      cameraRecordedChunksRef.current = { clean_program: [] };
      liveCaptureFramesByCamRef.current = { clean_program: [] };
      setLiveRecordingFramesByCam({ clean_program: [] });
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

      // Take initial frame at 0s for primary clean program
      const firstFrame = captureLiveTimelineThumbnail(0, primaryRawCanvas);
      if (firstFrame) {
        liveCaptureFramesRef.current = [firstFrame];
        liveCaptureFramesByCamRef.current["clean_program"] = [firstFrame];
        setLiveRecordingFrames([firstFrame]);
      }

      // Helper to ensure a MediaRecorder is running for any secondary camera track
      const startSecondaryCameraRecorder = (
        camTrack: StudioCameraTrackInfo,
        idx: number,
        initialSec = 0
      ): TimelineFrame | null => {
        if (camTrack.cameraId === "clean_program" || !camTrack.slot) return null;
        let camCanvas = cameraRawCanvasByKeyRef.current[camTrack.cameraId];
        if (!camCanvas && typeof document !== "undefined") {
          camCanvas = document.createElement("canvas");
          camCanvas.width = 1280;
          camCanvas.height = 720;
          if (hiddenVideosContainerRef.current) {
            hiddenVideosContainerRef.current.appendChild(camCanvas);
          }
          cameraRawCanvasByKeyRef.current[camTrack.cameraId] = camCanvas;
        }
        if (!camCanvas) return null;
        const camCtx = camCanvas.getContext("2d");
        if (camCtx) {
          camCtx.fillStyle = "#090d16";
          camCtx.fillRect(0, 0, camCanvas.width, camCanvas.height);
          drawCameraSlotRect(
            camCtx,
            camTrack.slot,
            idx,
            0,
            0,
            camCanvas.width,
            camCanvas.height,
            performance.now()
          );
        }
        const camFirstFrame = captureLiveTimelineThumbnail(initialSec, camCanvas);
        if (!liveCaptureFramesByCamRef.current[camTrack.cameraId]) {
          liveCaptureFramesByCamRef.current[camTrack.cameraId] = camFirstFrame
            ? [camFirstFrame]
            : [];
        }
        if (!cameraRecordedChunksRef.current[camTrack.cameraId]) {
          cameraRecordedChunksRef.current[camTrack.cameraId] = [];
        }

        const existingRec = cameraMediaRecordersRef.current[camTrack.cameraId];
        if (existingRec && existingRec.state !== "inactive") {
          return camFirstFrame;
        }

        try {
          const camStream = camCanvas.captureStream(15);
          const camRec = new MediaRecorder(camStream, {
            mimeType: camMimeType,
            videoBitsPerSecond: 2_200_000,
          });
          camRec.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              if (!cameraRecordedChunksRef.current[camTrack.cameraId]) {
                cameraRecordedChunksRef.current[camTrack.cameraId] = [];
              }
              cameraRecordedChunksRef.current[camTrack.cameraId].push(ev.data);
            }
          };
          camRec.onstop = async () => {
            const camChunks =
              cameraRecordedChunksRef.current[camTrack.cameraId] || [];
            const camFrames = [
              ...(liveCaptureFramesByCamRef.current[camTrack.cameraId] || []),
            ];
            if (camChunks.length === 0 && camFrames.length === 0) return;
            const camBlob = new Blob(camChunks, { type: camMimeType });
            const elapsedSec = Math.max(
              2,
              Math.round((Date.now() - recordStartTimeRef.current) / 1000)
            );
            const camVideo: StoredGameVideo = {
              id: generateUUID(),
              matchId: activeMatch?.id ?? "generic-game",
              gameNumber: activeMatch?.gameNumber ?? 1,
              title: `[${camTrack.label}] Game #${activeMatch?.gameNumber || 1} (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
              blob: camBlob,
              mimeType: camMimeType,
              sizeBytes: camBlob.size,
              durationSeconds: elapsedSec,
              createdAt: new Date().toISOString(),
              thumbnailDataUrl: camFrames[0]?.dataUrl || "",
              timelineFrames: camFrames,
              clockTags: [...liveClockTagsRef.current],
              homeScore,
              awayScore,
              homeTeamName,
              awayTeamName,
              cameraId: camTrack.cameraId,
              cameraLabel: camTrack.label,
              recordingSessionId,
              isRawCameraFootage: true,
            };
            await saveVideoToIndexedDB(camVideo);
            const updatedList = await getAllStoredVideos();
            setStoredVideos(updatedList);
          };
          camRec.start(500);
          cameraMediaRecordersRef.current[camTrack.cameraId] = camRec;
        } catch {
          // If MediaRecorder fails on this secondary stream, liveCaptureFramesByCamRef still captures every frame for replay!
        }
        return camFirstFrame;
      };

      // Also start per-camera MediaRecorders for every individual camera in availableStudioCameras
      const initialFramesMap: Record<string, TimelineFrame[]> = {
        clean_program: firstFrame ? [firstFrame] : [],
      };
      availableStudioCameras.forEach((camTrack, idx) => {
        if (camTrack.cameraId === "clean_program" || !camTrack.slot) return;
        const camFirstFrame = startSecondaryCameraRecorder(camTrack, idx, 0);
        initialFramesMap[camTrack.cameraId] = camFirstFrame ? [camFirstFrame] : [];
      });
      setLiveRecordingFramesByCam(initialFramesMap);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          if (!cameraRecordedChunksRef.current["clean_program"]) {
            cameraRecordedChunksRef.current["clean_program"] = [];
          }
          cameraRecordedChunksRef.current["clean_program"].push(event.data);
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
          title: `[Clean Raw Feed] Game #${activeMatch?.gameNumber || 1} (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
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
          cameraId: "clean_program",
          cameraLabel: "Program Clean Feed (Raw)",
          recordingSessionId,
          isRawCameraFootage: true,
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
        // Refresh storedVideos again after 400ms so all secondary camRec.onstop IndexedDB writes are guaranteed in state
        setTimeout(async () => {
          try {
            const allAfter = await getAllStoredVideos();
            setStoredVideos(allAfter);
          } catch {}
        }, 400);
        // Default to a 10-second Replay Selection Box at the end of the recording!
        const boxDur = Math.min(elapsedSec, replayBoxDurationPreset || 10);
        const defaultStart = Math.max(0, elapsedSec - boxDur);
        setTrimStartSec(defaultStart);
        setTrimEndSec(elapsedSec);
        setTimelinePlayheadSec(defaultStart);
        setIsRecording(false);
        setRecordSeconds(0);
        setTimelineNotice(
          `✓ Saved ${elapsedSec}s Raw Camera Recording (${availableStudioCameras.length} camera tracks, no scorebug baked in)! Switch cameras or drag the Replay Box below.`
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
          const snap = captureLiveTimelineThumbnail(
            next,
            cleanLiveCanvasRef.current || liveCanvasRef.current
          );
          if (snap) {
            liveCaptureFramesRef.current = [...liveCaptureFramesRef.current, snap];
            liveCaptureFramesByCamRef.current["clean_program"] = [
              ...(liveCaptureFramesByCamRef.current["clean_program"] || []),
              snap,
            ];
            setLiveRecordingFrames([...liveCaptureFramesRef.current]);
          }
          // Capture per-camera timeline thumbnails at 1fps (and auto-start recorder if a camera was added mid-recording)
          const nextCamFramesMap: Record<string, TimelineFrame[]> = {
            clean_program: [...(liveCaptureFramesByCamRef.current["clean_program"] || [])],
          };
          availableStudioCameras.forEach((camTrack, idx) => {
            if (camTrack.cameraId === "clean_program") return;
            startSecondaryCameraRecorder(camTrack, idx, next);
            const camC = cameraRawCanvasByKeyRef.current[camTrack.cameraId];
            if (camC) {
              const camSnap = captureLiveTimelineThumbnail(next, camC);
              if (camSnap) {
                const prevArr = liveCaptureFramesByCamRef.current[camTrack.cameraId] || [];
                const updatedArr = [...prevArr, camSnap];
                liveCaptureFramesByCamRef.current[camTrack.cameraId] = updatedArr;
                nextCamFramesMap[camTrack.cameraId] = updatedArr;
              }
            }
          });
          setLiveRecordingFramesByCam(nextCamFramesMap);
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
    Object.values(cameraMediaRecordersRef.current).forEach((camRec) => {
      try {
        if (camRec && camRec.state !== "inactive") {
          camRec.stop();
        }
      } catch {}
    });
    cameraMediaRecordersRef.current = {};
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

  useEffect(() => {
    if (activeMatch?.streamUrl) {
      setFbLivePublicUrl(activeMatch.streamUrl);
    }
  }, [activeMatch?.id, activeMatch?.streamUrl]);

  const handleSaveAndBroadcastStreamUrl = (customUrl?: string) => {
    const targetUrl = (customUrl !== undefined ? customUrl : fbLivePublicUrl).trim();
    if (!activeLeague || !activeMatch) return;

    // 1. Update Match Details in tournament bracket / schedule
    updateMatchDetailsInLeague(activeLeague.id, activeMatch.id, {
      streamUrl: targetUrl,
      isStreaming: Boolean(targetUrl),
    });

    // 2. Build or update LiveGameSession so live scores, timer and video link are tightly coupled
    const baseSession: LiveGameSession = liveSession ?? {
      matchId: activeMatch.id,
      leagueId: activeLeague.id,
      currentPeriod: 1,
      clockSecondsRemaining: (activeLeague.rulesConfig?.periodLengthMinutes || 10) * 60,
      shotClockSeconds: activeLeague.rulesConfig?.shotClockSeconds || 24,
      isClockRunning: false,
      possessionArrow: "HOME",
      activeBallPossession: "HOME",
      homeScore: activeMatch.homeScore ?? 0,
      awayScore: activeMatch.awayScore ?? 0,
      homeQuarterScores: [activeMatch.homeScore ?? 0, 0, 0, 0],
      awayQuarterScores: [activeMatch.awayScore ?? 0, 0, 0, 0],
      homeTeamFoulsByPeriod: [0, 0, 0, 0],
      awayTeamFoulsByPeriod: [0, 0, 0, 0],
      homeTimeoutsRemaining: 5,
      awayTimeoutsRemaining: 5,
      assignedRefereeIds: [],
      homePlayerStats: {},
      awayPlayerStats: {},
      homeRunningScore: {},
      awayRunningScore: {},
      playEvents: [],
      updatedAt: new Date().toISOString(),
    };

    const updatedSession: LiveGameSession = {
      ...baseSession,
      streamUrl: targetUrl,
      isStreaming: Boolean(targetUrl),
      updatedAt: new Date().toISOString(),
    };

    saveGameSession(activeMatch.id, updatedSession);

    // 3. Supabase Realtime Broadcast across remote devices (iOS, Android, Spectator web)
    try {
      const syncChannel = supabase.channel("boxscore_realtime_sync");
      syncChannel.send({
        type: "broadcast",
        event: "GAME_SESSION_UPDATE",
        payload: {
          matchId: activeMatch.id,
          leagueId: activeLeague.id,
          session: updatedSession,
          streamUrl: targetUrl,
          isStreaming: Boolean(targetUrl),
        },
      });
      syncChannel.send({
        type: "broadcast",
        event: "NOTIFICATION_EVENT",
        payload: { type: "TOURNAMENT_UPDATED", leagueId: activeLeague.id },
      });
    } catch {}

    // 4. Intra-browser BroadcastChannels for 0ms instant tab sync
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const bcGames = new BroadcastChannel("boxscore_game_sessions_sync");
        bcGames.postMessage({
          type: "GAME_SESSION_UPDATE",
          matchId: activeMatch.id,
          session: updatedSession,
        });
        bcGames.close();
      } catch {}

      try {
        const bcNotif = new BroadcastChannel("boxscore_notifications_sync");
        bcNotif.postMessage({ type: "TOURNAMENT_UPDATED", leagueId: activeLeague.id });
        bcNotif.close();
      } catch {}
    }

    void persistLeagueGamesToCloud(activeLeague.id);

    setStreamSavedNotice(
      targetUrl
        ? "Facebook Live link broadcasted to iOS & mobile app!"
        : "Stream link cleared."
    );
    setTimeout(() => setStreamSavedNotice(null), 4000);
  };

  const getStreamPresetSpecs = useCallback(
    (preset: "360p" | "540p" | "720p" = streamQualityPreset) => {
      if (preset === "360p") {
        return {
          width: 640,
          height: 360,
          fps: 20,
          bitrate: 550_000,
          kbps: 550,
          label: "360p Low Data (Fastest / Slow Internet)",
        };
      }
      if (preset === "720p") {
        return {
          width: 1280,
          height: 720,
          fps: 24,
          bitrate: 1_600_000,
          kbps: 1600,
          label: "720p HD (High Speed Internet & Fast PC)",
        };
      }
      return {
        width: 960,
        height: 540,
        fps: 24,
        bitrate: 1_000_000,
        kbps: 1000,
        label: "540p Balanced HD (Recommended)",
      };
    },
    [streamQualityPreset]
  );

  const runStreamHealthCheck = useCallback(async () => {
    setIsTestingStreamHealth(true);
    try {
      const nav =
        typeof navigator !== "undefined"
          ? (navigator as Navigator & {
              hardwareConcurrency?: number;
              deviceMemory?: number;
              connection?: {
                downlink?: number;
                rtt?: number;
                effectiveType?: string;
              };
            })
          : null;

      const cpuCores = nav?.hardwareConcurrency || 4;
      const deviceMemoryGb = nav?.deviceMemory ?? null;
      const downlinkMbps = nav?.connection?.downlink ?? null;
      const browserRttMs = nav?.connection?.rtt ?? 0;
      const networkType = nav?.connection?.effectiveType || "broadband";

      // Measure actual HTTP round-trip latency to /api/rtmp-stream relay
      const t0 = performance.now();
      let pingMs = browserRttMs || 120;
      try {
        const res = await fetch("/api/rtmp-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            sessionId: rtmpSessionIdRef.current,
          }),
        });
        await res.json();
        pingMs = Math.max(10, Math.round(performance.now() - t0));
      } catch {
        pingMs = 1500;
      }

      const specs = getStreamPresetSpecs(streamQualityPreset);
      const activeCamCount = liveScene?.cameras.length || 1;

      // Evaluate Internet Health
      let internetStatus: "ok" | "slow" | "critical" = "ok";
      let internetDiagnosis = `Internet OK (${pingMs}ms server ping${downlinkMbps ? ` • ~${downlinkMbps} Mbps link` : ""}). Ready for smooth ${streamQualityPreset} streaming.`;

      if (pingMs > 1100 || (downlinkMbps !== null && downlinkMbps < 1.2) || networkType === "2g" || networkType === "slow-2g") {
        internetStatus = "critical";
        internetDiagnosis = `⚠️ Weak / Slow Internet (${pingMs}ms latency${downlinkMbps ? `, ${downlinkMbps} Mbps` : ""}). High latency delays H.264 Keyframes and causes Facebook Live Green Screen or timeouts. Switch to 360p Low Data mode!`;
      } else if (pingMs > 550 || (downlinkMbps !== null && downlinkMbps < 2.5) || networkType === "3g") {
        internetStatus = "slow";
        internetDiagnosis = `Internet is moderate/slow (${pingMs}ms ping). Use 540p or 360p mode to prevent frame drops and green screen artifacts.`;
      }

      // Evaluate Computer Resource Health
      let computerStatus: "ok" | "high_load" | "overloaded" = "ok";
      let computerDiagnosis = `Computer Resources OK (${cpuCores} CPU cores${deviceMemoryGb ? ` • ${deviceMemoryGb}GB RAM` : ""}). Hardware H.264 encoding ready.`;

      if (cpuCores <= 2 || (deviceMemoryGb !== null && deviceMemoryGb <= 4 && activeCamCount >= 2 && isRecording)) {
        computerStatus = "overloaded";
        computerDiagnosis = `⚠️ Computer Resources Tight (${cpuCores} cores${deviceMemoryGb ? `, ${deviceMemoryGb}GB RAM` : ""}) while running ${activeCamCount} cameras + recording. Use 360p or 540p to avoid CPU/GPU frame drops.`;
      } else if (cpuCores <= 4 && activeCamCount >= 2 && streamQualityPreset === "720p") {
        computerStatus = "high_load";
        computerDiagnosis = `Moderate CPU/GPU load (${activeCamCount}-cam split screen at 720p on ${cpuCores} cores). 540p Balanced mode is recommended for cooler, smoother performance.`;
      }

      const activeIssues: string[] = [];
      if (internetStatus !== "ok") activeIssues.push(internetDiagnosis);
      if (computerStatus !== "ok") activeIssues.push(computerDiagnosis);

      const overallStatus: "healthy" | "warning" | "critical" =
        internetStatus === "critical" || computerStatus === "overloaded"
          ? "critical"
          : internetStatus === "slow" || computerStatus === "high_load"
            ? "warning"
            : "healthy";

      const overallScore =
        overallStatus === "healthy" ? 96 : overallStatus === "warning" ? 72 : 42;

      setStreamHealth((prev) => ({
        ...prev,
        overallStatus,
        overallScore,
        internetStatus,
        pingLatencyMs: pingMs,
        targetBitrateKbps: specs.kbps,
        downlinkMbps,
        networkType,
        internetDiagnosis,
        computerStatus,
        targetFps: specs.fps,
        EncodingFps: specs.fps,
        cpuCores,
        deviceMemoryGb,
        computerDiagnosis,
        greenScreenDiagnosis:
          overallStatus === "critical"
            ? "⚠️ High Green Screen Risk on 720p due to slow internet/CPU. Auto-Keyframe Guard is enabled; switch to 360p/540p for best stability."
            : "✓ Strict IDR Keyframe & SPS/PPS Color Guard active — prevents orphaned P-frames (the #1 cause of Facebook Live green screen).",
        activeIssues,
      }));
    } finally {
      setIsTestingStreamHealth(false);
    }
  }, [getStreamPresetSpecs, isRecording, liveScene?.cameras.length, streamQualityPreset]);

  const forceStreamKeyframeResync = useCallback((customNotice?: string) => {
    // Purge any queued delta P-frames and force an immediate full-color IDR Keyframe
    pendingRtmpFramesRef.current = [];
    waitingForFreshKeyframeRef.current = true;
    forceNextKeyframeRef.current = true;
    setStreamError(null);
    setStreamHealth((prev) => ({
      ...prev,
      videoSyncStatus: "resyncing",
      greenScreenDiagnosis:
        customNotice ||
        "🔄 Forced fresh H.264 IDR Keyframe + SPS/PPS Color Headers! Facebook Live preview will refresh in ~2–3 seconds.",
    }));
  }, []);

  const startRtmpLiveStream = async (overridePreset?: "360p" | "540p" | "720p") => {
    setStreamError(null);

    if (!streamKey.trim()) {
      setStreamError(
        "Paste your Facebook Stream Key (e.g. FB-177029...) from Facebook Live Producer first."
      );
      setShowFbSetupModal(true);
      return;
    }

    const activePreset = overridePreset || streamQualityPreset;
    if (overridePreset && overridePreset !== streamQualityPreset) {
      setStreamQualityPreset(overridePreset);
    }
    const specs = getStreamPresetSpecs(activePreset);

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
        flush?: () => Promise<void>;
        close: () => void;
        state: string;
        encodeQueueSize?: number;
      };
      VideoFrame?: new (
        source: HTMLCanvasElement,
        init: { timestamp: number; duration?: number }
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
    forceNextKeyframeRef.current = false;
    waitingForFreshKeyframeRef.current = false;
    streamFrameCountRef.current = 0;
    streamStartTimeRef.current = performance.now();
    rtmpTelemetryRef.current = {
      encodedFramesInWindow: 0,
      cpuDroppedFrames: 0,
      networkStallsCount: 0,
      reconnectionsCount: 0,
      keyframesSent: 0,
      lastKeyframeSentAtMs: Date.now(),
      lastPushLatencyMs: 0,
      bytesSentInWindow: 0,
    };

    try {
      // 1. Prepare Broadcast Encoder Canvas matching selected quality preset
      if (!encoderCanvasRef.current) {
        encoderCanvasRef.current = document.createElement("canvas");
      }
      encoderCanvasRef.current.width = specs.width;
      encoderCanvasRef.current.height = specs.height;

      const maxQueueFrames = specs.fps * 3; // Max 3 seconds buffer

      // 2. Configure Hardware H.264 Baseline Encoder with strict GOP/Keyframe continuity guard
      const encoder = new win.VideoEncoder({
        output: (chunk, meta) => {
          const isKey = chunk.type === "key";
          if (meta?.decoderConfig?.description) {
            const descBytes = new Uint8Array(meta.decoderConfig.description);
            if (descBytes.length > 0) {
              avcConfigBase64Ref.current = uint8ArrayToBase64(descBytes);
            }
          }

          // GREEN-SCREEN PREVENTION:
          // If frames were dropped due to a network stall/timeout, never enqueue trailing delta P-frames!
          // Wait until the newly requested IDR Keyframe arrives so Facebook's decoder never gets corrupted.
          if (waitingForFreshKeyframeRef.current) {
            if (!isKey) {
              return;
            }
            waitingForFreshKeyframeRef.current = false;
          }

          const buf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(buf);
          pendingRtmpFramesRef.current.push({
            timestampMs: Math.max(0, Math.round(chunk.timestamp / 1000)),
            isKeyframe: isKey,
            dataBase64: uint8ArrayToBase64(buf),
          });

          // If internet upload stalls, prune only complete older GOPs up to the latest Keyframe
          if (pendingRtmpFramesRef.current.length > maxQueueFrames) {
            let lastKeyIdx = -1;
            for (let i = pendingRtmpFramesRef.current.length - 1; i >= 0; i--) {
              if (pendingRtmpFramesRef.current[i].isKeyframe) {
                lastKeyIdx = i;
                break;
              }
            }
            if (lastKeyIdx > 0) {
              pendingRtmpFramesRef.current = pendingRtmpFramesRef.current.slice(lastKeyIdx);
            } else {
              pendingRtmpFramesRef.current = [];
              waitingForFreshKeyframeRef.current = true;
              forceNextKeyframeRef.current = true;
            }
            rtmpTelemetryRef.current.networkStallsCount += 1;
          }
        },
        error: (err) => {
          setStreamError(`Encoder error: ${err.message}`);
        },
      });

      encoder.configure({
        codec: "avc1.42001f",
        width: specs.width,
        height: specs.height,
        bitrate: specs.bitrate,
        framerate: specs.fps,
        hardwareAcceleration: "prefer-hardware",
        bitrateMode: "variable",
        latencyMode: "realtime",
        avc: { format: "avc" },
      });
      videoEncoderRef.current = encoder;

      // Encode & FLUSH initial IDR keyframe BEFORE connecting so avcC + Keyframe #0 are ready immediately
      if (liveCanvasRef.current && encoderCanvasRef.current) {
        const eCtx = encoderCanvasRef.current.getContext("2d");
        if (eCtx) {
          eCtx.fillStyle = "#0b0f19";
          eCtx.fillRect(0, 0, specs.width, specs.height);
          eCtx.drawImage(liveCanvasRef.current, 0, 0, specs.width, specs.height);
          const firstVf = new win.VideoFrame(encoderCanvasRef.current, { timestamp: 0 });
          encoder.encode(firstVf, { keyFrame: true });
          firstVf.close();
          if (typeof encoder.flush === "function") {
            await encoder.flush();
          }
          streamFrameCountRef.current = 1;
        }
      }

      const initialFramesBatch = pendingRtmpFramesRef.current.splice(0, 10);

      // 3. Connect to Facebook Live / YouTube Live RTMPS Server & send initial headers + Keyframe #0
      const startT0 = performance.now();
      const startRes = await fetch("/api/rtmp-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          sessionId,
          rtmpUrl: rtmpServerUrl,
          streamKey: streamKey.trim(),
          avcConfigBase64: avcConfigBase64Ref.current,
          metaConfig: {
            width: specs.width,
            height: specs.height,
            videodatarate: specs.kbps,
            framerate: specs.fps,
          },
          frames: initialFramesBatch,
        }),
      });

      const startJson = (await startRes.json()) as {
        ok: boolean;
        bytesSent?: number;
        framesSent?: number;
        keyframesSent?: number;
        error?: string;
      };

      if (!startRes.ok || !startJson.ok) {
        throw new Error(
          startJson.error ||
            "Could not connect to Facebook Live RTMPS server. Verify your Stream Key."
        );
      }

      rtmpTelemetryRef.current.lastPushLatencyMs = Math.round(performance.now() - startT0);
      if (startJson.keyframesSent && startJson.keyframesSent > 0) {
        rtmpTelemetryRef.current.keyframesSent += startJson.keyframesSent;
        rtmpTelemetryRef.current.lastKeyframeSentAtMs = Date.now();
      }

      setIsConnectingStream(false);
      setIsStreamingLive(true);
      setStreamDurationSec(0);
      setStreamFramesSent(startJson.framesSent || 0);
      setStreamBytesSent(startJson.bytesSent || 0);

      // 4. Start Frame Encoding Loop from Right Live Program Canvas with 1-second Keyframe cadence
      const frameDurationUs = Math.round(1_000_000 / specs.fps);
      const intervalMs = Math.max(16, Math.round(1000 / specs.fps));

      encoderLoopRef.current = setInterval(() => {
        const lCanvas = liveCanvasRef.current;
        const eCanvas = encoderCanvasRef.current;
        const enc = videoEncoderRef.current;
        if (!lCanvas || !eCanvas || !enc || enc.state !== "configured") return;

        // Check computer hardware encoder queue backpressure
        if (typeof enc.encodeQueueSize === "number" && enc.encodeQueueSize > 10) {
          rtmpTelemetryRef.current.cpuDroppedFrames += 1;
          forceNextKeyframeRef.current = true;
          return;
        }

        const eCtx = eCanvas.getContext("2d");
        if (!eCtx) return;
        eCtx.fillStyle = "#0b0f19";
        eCtx.fillRect(0, 0, eCanvas.width, eCanvas.height);
        eCtx.drawImage(lCanvas, 0, 0, eCanvas.width, eCanvas.height);

        const currentFrameIndex = streamFrameCountRef.current;
        const frameTimestampUs = currentFrameIndex * frameDurationUs;
        // Emit an IDR Keyframe every 1 second (every `specs.fps` frames) OR immediately when resync requested
        const isKey =
          forceNextKeyframeRef.current || currentFrameIndex % specs.fps === 0;
        if (forceNextKeyframeRef.current) {
          forceNextKeyframeRef.current = false;
        }
        streamFrameCountRef.current += 1;
        rtmpTelemetryRef.current.encodedFramesInWindow += 1;

        try {
          const vf = new win.VideoFrame!(eCanvas, {
            timestamp: frameTimestampUs,
            duration: frameDurationUs,
          });
          enc.encode(vf, { keyFrame: isKey });
          vf.close();
        } catch {}
      }, intervalMs);

      // 5. Start Sequential RTMPS Packet Flush Loop (flushing up to 60 frames per batch)
      flushLoopRef.current = setInterval(async () => {
        if (isFlushingRtmpRef.current || pendingRtmpFramesRef.current.length === 0) {
          return;
        }
        isFlushingRtmpRef.current = true;
        const batch = pendingRtmpFramesRef.current.splice(0, 60);
        const pushT0 = performance.now();

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
              metaConfig: {
                width: specs.width,
                height: specs.height,
                videodatarate: specs.kbps,
                framerate: specs.fps,
              },
              frames: batch,
            }),
          });
          const rttMs = Math.round(performance.now() - pushT0);
          rtmpTelemetryRef.current.lastPushLatencyMs = rttMs;

          const pushJson = (await pushRes.json()) as {
            ok: boolean;
            reconnected?: boolean;
            bytesSent?: number;
            framesSent?: number;
            keyframesSent?: number;
            needsKeyframe?: boolean;
            error?: string;
          };

          if (pushJson.ok) {
            const sentCount = pushJson.framesSent ?? batch.length;
            const sentBytes = pushJson.bytesSent ?? 0;
            setStreamFramesSent((prev) => prev + sentCount);
            setStreamBytesSent((prev) => prev + sentBytes);
            rtmpTelemetryRef.current.bytesSentInWindow += sentBytes;

            if (pushJson.keyframesSent && pushJson.keyframesSent > 0) {
              rtmpTelemetryRef.current.keyframesSent += pushJson.keyframesSent;
              rtmpTelemetryRef.current.lastKeyframeSentAtMs = Date.now();
            }
            if (pushJson.reconnected) {
              rtmpTelemetryRef.current.reconnectionsCount += 1;
            }
            if (pushJson.needsKeyframe || pushJson.reconnected) {
              // Server reconnected or needs an IDR Keyframe — purge delta frames & force immediate Keyframe
              pendingRtmpFramesRef.current = [];
              waitingForFreshKeyframeRef.current = true;
              forceNextKeyframeRef.current = true;
            }
            // Clear transient timeout warning once frames flow again
            setStreamError((prev) =>
              prev && prev.includes("Timed out") ? null : prev
            );
          } else {
            // Push rejected or timed out — resync on a clean IDR Keyframe so green screen never occurs
            pendingRtmpFramesRef.current = [];
            waitingForFreshKeyframeRef.current = true;
            forceNextKeyframeRef.current = true;
            rtmpTelemetryRef.current.networkStallsCount += 1;
            if (pushJson.error) {
              setStreamError(pushJson.error);
            }
          }
        } catch {
          // Network blip / timeout — purge orphaned P-frames and force fresh IDR Keyframe
          rtmpTelemetryRef.current.lastPushLatencyMs = Math.round(performance.now() - pushT0);
          rtmpTelemetryRef.current.networkStallsCount += 1;
          pendingRtmpFramesRef.current = [];
          waitingForFreshKeyframeRef.current = true;
          forceNextKeyframeRef.current = true;
        } finally {
          isFlushingRtmpRef.current = false;
        }
      }, 120);

      // 6. Elapsed Stream Uptime + Real-Time Livestream Health & Resource Telemetry Loop (every 1s)
      streamTimerRef.current = setInterval(() => {
        setStreamDurationSec((prev) => prev + 1);

        const tel = rtmpTelemetryRef.current;
        const enc = videoEncoderRef.current;
        const queueSize = typeof enc?.encodeQueueSize === "number" ? enc.encodeQueueSize : 0;
        const actualFps = Math.min(specs.fps, tel.encodedFramesInWindow);
        const uploadKbps = Math.round((tel.bytesSentInWindow * 8) / 1000);
        const pingMs = tel.lastPushLatencyMs;
        const lastKeySec = Math.max(
          0,
          Math.round((Date.now() - tel.lastKeyframeSentAtMs) / 1000)
        );

        // Reset 1-second window counters
        tel.encodedFramesInWindow = 0;
        tel.bytesSentInWindow = 0;

        const nav =
          typeof navigator !== "undefined"
            ? (navigator as Navigator & {
                hardwareConcurrency?: number;
                deviceMemory?: number;
                connection?: { downlink?: number; effectiveType?: string };
              })
            : null;
        const cpuCores = nav?.hardwareConcurrency || 4;
        const deviceMemoryGb = nav?.deviceMemory ?? null;
        const downlinkMbps = nav?.connection?.downlink ?? null;
        const networkType = nav?.connection?.effectiveType || "broadband";

        // 1. Diagnose Internet Connection
        let internetStatus: "ok" | "slow" | "critical" = "ok";
        let internetDiagnosis = `Internet OK (${pingMs}ms ping • ${uploadKbps} kbps upload)`;
        if (pingMs > 1200 || pendingRtmpFramesRef.current.length > specs.fps * 2) {
          internetStatus = "critical";
          internetDiagnosis = `⚠️ Internet Connection Too Slow (${pingMs}ms latency • ${pendingRtmpFramesRef.current.length} frames queued). Upload bottleneck causes timeouts & Green Screen on higher bitrates!`;
        } else if (pingMs > 600 || pendingRtmpFramesRef.current.length > specs.fps) {
          internetStatus = "slow";
          internetDiagnosis = `Internet upload is lagging (${pingMs}ms ping • ${uploadKbps} kbps). Lower quality to 360p if video stutters.`;
        }

        // 2. Diagnose Computer CPU/GPU Resources
        let computerStatus: "ok" | "high_load" | "overloaded" = "ok";
        let computerDiagnosis = `Computer CPU/GPU OK (${actualFps}/${specs.fps} FPS • Encoder Queue: ${queueSize})`;
        if (queueSize > 8 || actualFps < specs.fps * 0.55) {
          computerStatus = "overloaded";
          computerDiagnosis = `⚠️ Computer CPU/GPU Overloaded (Encoding ${actualFps}/${specs.fps} FPS, Queue: ${queueSize}). Close extra tabs, pause local recording, or switch to 360p!`;
        } else if (queueSize > 4 || actualFps < specs.fps * 0.8) {
          computerStatus = "high_load";
          computerDiagnosis = `Computer CPU/GPU under heavy load (${actualFps}/${specs.fps} FPS, Queue: ${queueSize}).`;
        }

        // 3. Diagnose Video / Green Screen Sync
        const videoSyncStatus: "synced" | "resyncing" | "waiting_keyframe" =
          waitingForFreshKeyframeRef.current
            ? "resyncing"
            : tel.keyframesSent === 0
              ? "waiting_keyframe"
              : "synced";

        let greenScreenDiagnosis = `✓ H.264 IDR Keyframes Synced (${tel.keyframesSent} keyframes sent, last ${lastKeySec}s ago). Color headers healthy.`;
        if (videoSyncStatus === "resyncing" || lastKeySec > 4) {
          greenScreenDiagnosis = `🔄 Re-syncing H.264 IDR Keyframe after network stall so Facebook Live does not show a Green Screen...`;
        }

        const activeIssues: string[] = [];
        if (internetStatus !== "ok") activeIssues.push(internetDiagnosis);
        if (computerStatus !== "ok") activeIssues.push(computerDiagnosis);

        const overallStatus: "healthy" | "warning" | "critical" =
          internetStatus === "critical" || computerStatus === "overloaded"
            ? "critical"
            : internetStatus === "slow" || computerStatus === "high_load" || videoSyncStatus !== "synced"
              ? "warning"
              : "healthy";

        const overallScore =
          overallStatus === "healthy"
            ? 98
            : overallStatus === "warning"
              ? 68
              : 35;

        setStreamHealth({
          overallStatus,
          overallScore,
          internetStatus,
          pingLatencyMs: pingMs,
          uploadBitrateKbps: uploadKbps,
          targetBitrateKbps: specs.kbps,
          downlinkMbps,
          networkType,
          networkStallsCount: tel.networkStallsCount,
          reconnectionsCount: tel.reconnectionsCount,
          internetDiagnosis,
          computerStatus,
          encodingFps: actualFps,
          targetFps: specs.fps,
          encoderQueueSize: queueSize,
          cpuDroppedFrames: tel.cpuDroppedFrames,
          cpuCores,
          deviceMemoryGb,
          computerDiagnosis,
          videoSyncStatus,
          keyframesSent: tel.keyframesSent,
          lastKeyframeAgoSec: lastKeySec,
          greenScreenDiagnosis,
          activeIssues,
        });
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

  const handleSwitchStreamQualityLive = async (newPreset: "360p" | "540p" | "720p") => {
    setStreamQualityPreset(newPreset);
    if (isStreamingLive) {
      await stopRtmpLiveStream();
      setTimeout(() => {
        void startRtmpLiveStream(newPreset);
      }, 250);
    }
  };

  // Pop-Out Clean 16:9 Program Window (Zero-latency direct canvas mirror for Facebook Screen Share / OBS / Dual-Monitor)
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
    cleanPopupWindowRef.current = popup;
    popup.document.open();
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BOX SCORE - Clean Live Program Feed (Share this window in Facebook Live)</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #000; width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
          </style>
        </head>
        <body>
          <canvas id="cleanProgCanvas" width="1920" height="1080"></canvas>
        </body>
      </html>
    `);
    popup.document.close();
    const popCanvas = popup.document.getElementById(
      "cleanProgCanvas"
    ) as HTMLCanvasElement | null;
    if (popCanvas) {
      cleanPopupCanvasRef.current = popCanvas;
      const popCtx = popCanvas.getContext("2d");
      if (popCtx) {
        popCtx.drawImage(lCanvas, 0, 0, popCanvas.width, popCanvas.height);
      }
    }
  };

  const displayTimelineFrames = useMemo(() => {
    const camKey = selectedTimelineCameraKey || "clean_program";
    if (isRecording) {
      if (camKey !== "clean_program") {
        const camFrames = liveRecordingFramesByCam[camKey];
        if (camFrames && camFrames.length > 0) return camFrames;
        return rollingTimelineFramesByCam[camKey] || [];
      }
      return liveRecordingFrames;
    }
    if (camKey !== "clean_program") {
      if (activeCameraTimelineVideo?.timelineFrames?.length) {
        return activeCameraTimelineVideo.timelineFrames;
      }
      if (liveRecordingFramesByCam[camKey]?.length) {
        return liveRecordingFramesByCam[camKey];
      }
      return rollingTimelineFramesByCam[camKey] || [];
    }
    return (
      activeCameraTimelineVideo?.timelineFrames ||
      rollingTimelineFramesByCam["clean_program"] ||
      []
    );
  }, [
    isRecording,
    liveRecordingFramesByCam,
    rollingTimelineFramesByCam,
    selectedTimelineCameraKey,
    liveRecordingFrames,
    activeCameraTimelineVideo,
  ]);

  const activeTimelineDuration = Math.max(
    10,
    isRecording
      ? Math.max(15, recordSeconds + 2)
      : activeCameraTimelineVideo?.durationSeconds ||
          selectedTimelineVideo?.durationSeconds ||
          Math.max(15, displayTimelineFrames.length) ||
          20
  );

  const displayClockTags = useMemo(
    () =>
      isRecording
        ? liveClockTags
        : activeCameraTimelineVideo?.clockTags ||
          selectedTimelineVideo?.clockTags ||
          [],
    [isRecording, liveClockTags, activeCameraTimelineVideo, selectedTimelineVideo]
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

  // Resolve or create a StoredGameVideo specifically for a given cameraId (works during live recording, after recording, or from live rolling buffer!)
  const resolveOrCreateVideoForCamera = async (
    camKey: string
  ): Promise<StoredGameVideo | null> => {
    const camInfo = availableStudioCameras.find((c) => c.cameraId === camKey);
    const camLabel = camInfo?.label || "Program Clean Feed";

    // 1. If currently recording, flush & snapshot this specific camera's chunks & frames
    if (isRecording) {
      if (camKey === "clean_program") {
        try {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.requestData();
          }
        } catch {}
      } else {
        try {
          const camRec = cameraMediaRecordersRef.current[camKey];
          if (camRec && camRec.state === "recording") {
            camRec.requestData();
          }
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 65));

      const camChunks =
        camKey === "clean_program"
          ? recordedChunksRef.current
          : cameraRecordedChunksRef.current[camKey] || [];
      let camFrames =
        camKey === "clean_program"
          ? [...liveCaptureFramesRef.current]
          : [
              ...(liveCaptureFramesByCamRef.current[camKey]?.length
                ? liveCaptureFramesByCamRef.current[camKey]
                : rollingFramesByCamRef.current[camKey] || []),
            ];

      if (camFrames.length === 0) {
        const srcCanvas =
          camKey === "clean_program"
            ? cleanLiveCanvasRef.current || liveCanvasRef.current
            : cameraRawCanvasByKeyRef.current[camKey];
        const fallbackSnap = captureLiveTimelineThumbnail(
          Math.max(0, recordSeconds),
          srcCanvas
        );
        if (fallbackSnap) camFrames = [fallbackSnap];
      }

      if (camChunks.length > 0 || camFrames.length > 0) {
        const snapBlob = new Blob(camChunks, { type: "video/webm" });
        const elapsedSec = Math.max(2, recordSeconds, camFrames.length);
        const snapVideo: StoredGameVideo = {
          id: generateUUID(),
          matchId: activeMatch?.id ?? "generic-game",
          gameNumber: activeMatch?.gameNumber ?? 1,
          title: `[${camLabel}] Live Replay Clip (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
          blob: snapBlob,
          mimeType: "video/webm",
          sizeBytes: snapBlob.size,
          durationSeconds: elapsedSec,
          createdAt: new Date().toISOString(),
          thumbnailDataUrl: camFrames[0]?.dataUrl || "",
          timelineFrames: camFrames,
          clockTags: [...liveClockTagsRef.current],
          homeScore,
          awayScore,
          homeTeamName,
          awayTeamName,
          cameraId: camKey,
          cameraLabel: camLabel,
          recordingSessionId:
            activeRecordingSessionIdRef.current ||
            selectedTimelineVideo?.recordingSessionId,
          isRawCameraFootage: true,
        };
        await saveVideoToIndexedDB(snapVideo);
        const list = await getAllStoredVideos();
        setStoredVideos(list);
        return snapVideo;
      }
    }

    // 2. Check existing storedVideos in state, then refresh from IndexedDB in case camRec.onstop just finished
    let existing = resolveStoredVideoForCamera(camKey, storedVideos);
    if (!existing) {
      const freshList = await getAllStoredVideos();
      setStoredVideos(freshList);
      existing = resolveStoredVideoForCamera(camKey, freshList);
    }
    if (existing) {
      return existing;
    }

    // 3. Fallback: Build a StoredGameVideo for this camera from its in-memory chunks or continuous rolling frame buffer!
    const memChunks =
      camKey === "clean_program"
        ? recordedChunksRef.current
        : cameraRecordedChunksRef.current[camKey] || [];
    let memFrames =
      camKey === "clean_program"
        ? [
            ...(liveCaptureFramesRef.current.length
              ? liveCaptureFramesRef.current
              : rollingFramesByCamRef.current["clean_program"] || []),
          ]
        : [
            ...(liveCaptureFramesByCamRef.current[camKey]?.length
              ? liveCaptureFramesByCamRef.current[camKey]
              : rollingFramesByCamRef.current[camKey] || []),
          ];

    if (memFrames.length === 0) {
      const srcCanvas =
        camKey === "clean_program"
          ? cleanLiveCanvasRef.current || liveCanvasRef.current
          : cameraRawCanvasByKeyRef.current[camKey];
      const snapNow = captureLiveTimelineThumbnail(0, srcCanvas);
      if (snapNow) memFrames = [snapNow];
    }

    if (memChunks.length > 0 || memFrames.length > 0) {
      const camBlob = new Blob(memChunks, { type: "video/webm" });
      const elapsedSec = Math.max(
        10,
        selectedTimelineVideo?.durationSeconds || 0,
        memFrames.length
      );
      const createdCamVideo: StoredGameVideo = {
        id: generateUUID(),
        matchId: activeMatch?.id ?? "generic-game",
        gameNumber: activeMatch?.gameNumber ?? 1,
        title: `[${camLabel}] Camera Replay Clip (${homeTeamName} vs ${awayTeamName}) - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
        blob: camBlob,
        mimeType: "video/webm",
        sizeBytes: camBlob.size,
        durationSeconds: elapsedSec,
        createdAt: new Date().toISOString(),
        thumbnailDataUrl: memFrames[0]?.dataUrl || "",
        timelineFrames: memFrames,
        clockTags: [
          ...(selectedTimelineVideo?.clockTags || liveClockTagsRef.current),
        ],
        homeScore,
        awayScore,
        homeTeamName,
        awayTeamName,
        cameraId: camKey,
        cameraLabel: camLabel,
        recordingSessionId:
          selectedTimelineVideo?.recordingSessionId ||
          activeRecordingSessionIdRef.current ||
          undefined,
        isRawCameraFootage: true,
      };
      await saveVideoToIndexedDB(createdCamVideo);
      const list = await getAllStoredVideos();
      setStoredVideos(list);
      return createdCamVideo;
    }

    return null;
  };

  // Create a Replay Scene from the selected Timeline In/Out range & Selected Camera Track (works on ALL cameras!)
  const handleCreateReplaySceneFromTimeline = async (
    pushImmediatelyToLive = false,
    overrideCameraKey?: string
  ) => {
    const camKey =
      overrideCameraKey || selectedTimelineCameraKey || "clean_program";
    if (overrideCameraKey && overrideCameraKey !== selectedTimelineCameraKey) {
      setSelectedTimelineCameraKey(overrideCameraKey);
    }
    const camInfo = availableStudioCameras.find((c) => c.cameraId === camKey);
    const camLabel = camInfo?.label || "Program Clean Feed";

    const targetVideo = await resolveOrCreateVideoForCamera(camKey);
    if (!targetVideo) {
      alert(
        "Unable to capture replay for this camera yet. Make sure the camera is active or start live recording."
      );
      return;
    }

    const maxClipDur = Math.max(
      2,
      targetVideo.durationSeconds || activeTimelineDuration
    );
    const start = Math.max(0, Math.min(trimStartSec, trimEndSec - 0.5));
    const end = Math.max(start + 1, Math.min(trimEndSec, maxClipDur));
    const startGameClock = getGameClockLabelAtSec(start);
    const endGameClock = getGameClockLabelAtSec(end);

    const customTitle =
      replayClipLabel.trim() ||
      `Replay • ${camLabel} [${startGameClock}] (${formatClock(start)}-${formatClock(end)} @ ${selectedReplaySpeed}x)`;

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
        showGameClock: showReplayGameClock,
        cameraId: camKey,
        cameraLabel: camLabel,
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
        ? `⚡ Replay Scene "${customTitle}" (${camLabel} • ${startGameClock} → ${endGameClock}) pushed LIVE!`
        : `✓ Replay Scene "${customTitle}" (${camLabel} • ${startGameClock} → ${endGameClock}) added to Scenes & cued on Left Preview!`
    );
    setTimeout(() => setTimelineNotice(null), 5000);
  };

  // Switch the Camera Angle of an existing Replay Scene to any Studio Camera!
  const handleSwitchReplaySceneCamera = async (
    sceneId: string,
    newCameraKey: string
  ) => {
    const camInfo = availableStudioCameras.find(
      (c) => c.cameraId === newCameraKey
    );
    const camLabel = camInfo?.label || "Program Clean Feed";
    setSelectedTimelineCameraKey(newCameraKey);
    const targetVideo = await resolveOrCreateVideoForCamera(newCameraKey);
    if (!targetVideo) return;

    setScenes((prev) =>
      prev.map((sc) => {
        if (sc.id !== sceneId || sc.kind !== "replay_scene" || !sc.replayConfig) {
          return sc;
        }
        const start = sc.replayConfig.startSec;
        const end = sc.replayConfig.endSec;
        const spd = sc.replayConfig.playbackRate;
        const startGameClock = getGameClockLabelAtSec(start);
        return {
          ...sc,
          name: `🎬 Replay • ${camLabel} [${startGameClock}] (${formatClock(start)}-${formatClock(end)} @ ${spd}x)`,
          replayConfig: {
            ...sc.replayConfig,
            videoId: targetVideo.id,
            videoTitle: targetVideo.title,
            cameraId: newCameraKey,
            cameraLabel: camLabel,
          },
        };
      })
    );
    setTimelineNotice(
      `🎥 Switched Replay Scene camera angle to ${camLabel}!`
    );
    setTimeout(() => setTimelineNotice(null), 4000);
  };

  const handleScrubTimeline = useCallback(
    (sec: number) => {
      const maxDur = isRecording
        ? Math.max(10, recordSeconds)
        : activeTimelineDuration;
      const clamped = Math.max(0, Math.min(maxDur, Number(sec.toFixed(1))));
      setTimelinePlayheadSec(clamped);
      if (timelineScrubVideoRef.current) {
        try {
          timelineScrubVideoRef.current.currentTime = clamped;
        } catch {}
      }
    },
    [isRecording, recordSeconds, activeTimelineDuration]
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
      : activeCameraTimelineVideo?.durationSeconds ||
        selectedTimelineVideo?.durationSeconds ||
        activeTimelineDuration;
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
    activeCameraTimelineVideo,
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
  // REPLAY INSPECTOR ENGINE (RUN SLOW-MO REPLAY ON ANY CAMERA BEFORE PUTTING IT LIVE!)
  // =====================================================================
  const ensureInspectorVideoSource = useCallback(() => {
    const vidEl = timelineScrubVideoRef.current;
    const camKey = selectedTimelineCameraKey || "clean_program";
    const camChunks =
      camKey === "clean_program"
        ? recordedChunksRef.current
        : cameraRecordedChunksRef.current[camKey] || [];

    // If currently recording and chunks exist for the selected camera, load live buffer blob into Inspector
    if (isRecording && camChunks.length > 0 && vidEl) {
      const liveBlob = new Blob(camChunks, { type: "video/webm" });
      const url = URL.createObjectURL(liveBlob);
      vidEl.src = url;
      vidEl.setAttribute("data-scrub-id", `live-${camKey}-${recordSeconds}`);
      return true;
    }

    const targetVid =
      camKey === "clean_program"
        ? activeCameraTimelineVideo || selectedTimelineVideo
        : activeCameraTimelineVideo;
    if (targetVid && targetVid.sizeBytes > 1000 && vidEl) {
      const currentId = vidEl.getAttribute("data-scrub-id");
      if (currentId !== targetVid.id) {
        const url = URL.createObjectURL(targetVid.blob);
        vidEl.src = url;
        vidEl.setAttribute("data-scrub-id", targetVid.id);
      }
      return true;
    }

    // Even if only timelineFrames / rolling frames exist for this camera, Inspector can run frame-stepped slow-mo replay!
    if (displayTimelineFrames.length > 0) {
      return true;
    }
    return false;
  }, [
    isRecording,
    recordSeconds,
    selectedTimelineCameraKey,
    activeCameraTimelineVideo,
    selectedTimelineVideo,
    displayTimelineFrames.length,
  ]);

  const handleToggleInspectorReplay = () => {
    const vidEl = timelineScrubVideoRef.current;

    if (isPlayingInspectorReplay) {
      vidEl?.pause();
      setIsPlayingInspectorReplay(false);
      return;
    }

    const hasSource = ensureInspectorVideoSource();
    if (!hasSource) {
      alert("Start recording or activate a camera first to run a replay in the Replay Inspector.");
      return;
    }

    setTimelinePlayheadSec(trimStartSec);
    setIsPlayingInspectorReplay(true);
    if (vidEl && vidEl.getAttribute("data-scrub-id")) {
      vidEl.playbackRate = selectedReplaySpeed;
      try {
        if (vidEl.currentTime < trimStartSec || vidEl.currentTime >= trimEndSec) {
          vidEl.currentTime = trimStartSec;
        }
        vidEl.play().catch(() => {});
      } catch {}
    }
  };

  const handleRestartInspectorReplay = () => {
    const vidEl = timelineScrubVideoRef.current;
    if (!ensureInspectorVideoSource()) return;
    setTimelinePlayheadSec(trimStartSec);
    setIsPlayingInspectorReplay(true);
    if (vidEl && vidEl.getAttribute("data-scrub-id")) {
      vidEl.playbackRate = selectedReplaySpeed;
      try {
        vidEl.currentTime = trimStartSec;
        vidEl.play().catch(() => {});
      } catch {}
    }
  };

  // Loop Replay Inspector between trimStartSec and trimEndSec & advance Playhead (supports both Video Blob and Frame-Buffered Cameras!)
  useEffect(() => {
    if (!isPlayingInspectorReplay) return;
    const interval = setInterval(() => {
      const vidEl = timelineScrubVideoRef.current;
      const hasReadyVideo =
        Boolean(vidEl && vidEl.readyState >= 2 && !vidEl.paused && vidEl.videoWidth > 0) &&
        Boolean(
          selectedTimelineCameraKey === "clean_program" ||
            (activeCameraTimelineVideo && activeCameraTimelineVideo.sizeBytes > 1000) ||
            (isRecording && (cameraRecordedChunksRef.current[selectedTimelineCameraKey]?.length || 0) > 0)
        );

      if (hasReadyVideo && vidEl) {
        if (vidEl.playbackRate !== selectedReplaySpeed) {
          vidEl.playbackRate = selectedReplaySpeed;
        }
        if (vidEl.currentTime >= trimEndSec || vidEl.ended) {
          vidEl.currentTime = trimStartSec;
          vidEl.play().catch(() => {});
        }
        setTimelinePlayheadSec(Number(vidEl.currentTime.toFixed(1)));
      } else {
        setTimelinePlayheadSec((prev) => {
          const next = prev + 0.08 * selectedReplaySpeed;
          if (next >= trimEndSec || next < trimStartSec) {
            return trimStartSec;
          }
          return Number(next.toFixed(1));
        });
      }
    }, 80);
    return () => clearInterval(interval);
  }, [
    isPlayingInspectorReplay,
    trimStartSec,
    trimEndSec,
    selectedReplaySpeed,
    selectedTimelineCameraKey,
    activeCameraTimelineVideo,
    isRecording,
  ]);

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
    <div
      className={`min-h-screen flex flex-col font-sans select-none transition-colors duration-200 ${
        studioTheme === "light"
          ? "studio-light-mode bg-[#f1f5f9] text-slate-900"
          : "studio-dark-mode bg-[#0b0e14] text-slate-100"
      }`}
    >
      {/* Hidden Replay & Media Video Elements for Preview & Live Program + Offscreen DOM Container for WebRTC / USB Camera Decoding */}
      <video ref={previewReplayVideoRef} playsInline muted className="hidden" />
      <video ref={liveReplayVideoRef} playsInline muted className="hidden" />
      <video ref={previewMediaVideoRef} playsInline muted loop className="hidden" />
      <video ref={liveMediaVideoRef} playsInline muted loop className="hidden" />
      <div
        ref={hiddenVideosContainerRef}
        className="fixed -left-[9999px] top-0 w-px h-px overflow-hidden opacity-0 pointer-events-none"
        aria-hidden="true"
      />

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

        {/* Right: Facebook Live Stream, Section Order, Light Mode & Quick Record Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Facebook / YouTube Live Button + Live Health Pill */}
          {!isStreamingLive ? (
            <button
              type="button"
              onClick={() => {
                setShowFbSetupModal(true);
                void runStreamHealthCheck();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-sm cursor-pointer"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Go Live on Facebook / YouTube</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500 px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[0.68rem] font-black uppercase text-emerald-300">
                ON AIR • {streamPlatform.toUpperCase()} ({formatClock(streamDurationSec)}) • {streamQualityPreset.toUpperCase()}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[0.58rem] font-black uppercase ${
                  streamHealth.overallStatus === "critical"
                    ? "bg-rose-600 text-white animate-pulse"
                    : streamHealth.overallStatus === "warning"
                      ? "bg-amber-500 text-slate-950"
                      : "bg-emerald-600/40 text-emerald-200 border border-emerald-400/40"
                }`}
                title={`${streamHealth.internetDiagnosis} | ${streamHealth.computerDiagnosis}`}
              >
                {streamHealth.overallStatus === "critical"
                  ? `⚠️ POOR NET/CPU (${streamHealth.pingLatencyMs}ms)`
                  : streamHealth.overallStatus === "warning"
                    ? `⚡ LAG RISK (${streamHealth.pingLatencyMs}ms)`
                    : `✓ HEALTHY (${streamHealth.encodingFps}fps • ${streamHealth.pingLatencyMs}ms)`}
              </span>
              <button
                type="button"
                onClick={() => forceStreamKeyframeResync()}
                className="rounded bg-amber-500 hover:bg-amber-400 px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-950 cursor-pointer"
                title="Force an immediate full-color H.264 Keyframe if Facebook Live preview shows a green screen"
              >
                🔧 Fix Green
              </button>
              <button
                type="button"
                onClick={stopRtmpLiveStream}
                className="rounded bg-rose-600 hover:bg-rose-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white cursor-pointer"
              >
                End Stream
              </button>
            </div>
          )}

          {/* Section Top/Bottom Order Switcher + Visibility Toggles */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-xs">
            <button
              type="button"
              onClick={() => handleSwapTopSection()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[0.62rem] font-black uppercase text-amber-300 hover:text-white cursor-pointer border border-slate-700 transition-colors"
              title="Switch which section is on top: Camera Timeline or Scenes and Live"
            >
              <ArrowUpDown className="h-3 w-3 text-amber-400" />
              <span>
                Top: {topSection === "timeline" ? "Timeline" : "Scenes & Live"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleShowTimeline()}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.62rem] font-bold cursor-pointer border transition-colors ${
                showTimeline
                  ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                  : "bg-slate-800/80 border-slate-700 text-slate-500 line-through"
              }`}
              title={showTimeline ? "Hide Camera Timeline" : "Show Camera Timeline"}
            >
              {showTimeline ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
              <span>Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => toggleShowScenesAndLive()}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.62rem] font-bold cursor-pointer border transition-colors ${
                showScenesAndLive
                  ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-800/80 border-slate-700 text-slate-500 line-through"
              }`}
              title={showScenesAndLive ? "Hide Scenes and Live" : "Show Scenes and Live"}
            >
              {showScenesAndLive ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
              <span>Scenes &amp; Live</span>
            </button>
          </div>

          {/* Light Mode / Dark Mode Toggle */}
          <button
            type="button"
            onClick={() => toggleStudioTheme()}
            aria-pressed={studioTheme === "light"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-200 cursor-pointer transition-colors"
            title={
              studioTheme === "dark"
                ? "Switch Studio to Light Mode"
                : "Switch Studio to Dark Mode"
            }
          >
            {studioTheme === "dark" ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-500" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

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
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-emerald-950/50 border-b border-emerald-500/30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-[0.62rem] font-black uppercase text-slate-950">
                PREVIEW (LEFT)
              </span>
              <span className="text-xs font-black uppercase text-emerald-200 truncate">
                {previewScene?.name}
              </span>
              <span className="hidden sm:inline-flex rounded bg-emerald-950/90 px-2 py-0.5 text-[0.58rem] font-bold text-emerald-300 border border-emerald-500/30 truncate">
                {previewScene?.kind === "replay_scene"
                  ? `🎬 Replay (${previewScene.replayConfig?.playbackRate}x)`
                  : previewScene?.kind === "video_scene"
                  ? `🎬 Video: ${previewScene.mediaConfig?.fileName}`
                  : previewScene?.kind === "picture_scene"
                  ? `🖼️ Picture: ${previewScene.mediaConfig?.fileName}`
                  : `🎥 ${previewScene?.cameras.length || 0} Cam(s) • ${previewScene?.layout.toUpperCase()}`}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <label className="flex items-center gap-1.5 text-[0.65rem] font-bold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOverlayInPreview}
                  onChange={(e) => setShowOverlayInPreview(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                Show Scorebug
              </label>
              <button
                type="button"
                onClick={() => toggleShowPreviewScenesStrip()}
                className="flex items-center gap-1 text-[0.65rem] font-bold text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                title={showPreviewScenesStrip ? "Hide Scenes bottom bar under Preview" : "Show Scenes bottom bar under Preview"}
              >
                {showPreviewScenesStrip ? <Eye className="h-3 w-3 text-emerald-400" /> : <EyeOff className="h-3 w-3 text-slate-400" />}
                <span>Scenes Bar</span>
              </button>
            </div>
          </div>

          <div className="studio-video-viewport relative aspect-video w-full bg-black flex items-center justify-center">
            <canvas
              ref={previewCanvasRef}
              width={1920}
              height={1080}
              className="w-full h-full object-contain"
            />
          </div>

          {/* PREVIEW BOTTOM BAR: HORIZONTALLY SCROLLABLE SCENES PREVIEW STRIP */}
          {showPreviewScenesStrip && (
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
                      <div className="studio-video-viewport relative aspect-video w-full bg-black overflow-hidden">
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
          )}
        </div>

        {/* CENTER COLUMN: OBS STUDIO MODE TRANSITION BAR (3 LOGO DESIGNS, DURATION & UPLOAD) */}
        <div className="lg:col-span-1 flex flex-wrap lg:flex-col items-center justify-center gap-1.5 p-2 rounded-xl border border-slate-800 bg-[#131926]">
          <span className="hidden lg:block text-[0.62rem] font-black uppercase tracking-widest text-slate-400 text-center">
            Transition
          </span>

          <button
            type="button"
            onClick={handleCutToLive}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 px-2 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5"
            title="Instant Cut from Left Preview to Right Live Output"
          >
            <span className="flex items-center gap-1">
              <span>CUT</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.52rem] font-bold text-rose-100">Instant</span>
          </button>

          {/* DESIGN 1: DIAGONAL SLASH LOGO WIPE */}
          <button
            type="button"
            onClick={() => handleLogoTransitionToLive("slash_wipe")}
            className={`w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 border px-2 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              selectedTransitionDesign === "slash_wipe"
                ? "border-amber-300 ring-1 ring-amber-400/60"
                : "border-sky-400/40"
            }`}
            title="Design 1: Solid Diagonal Slash Logo Wipe Transition"
          >
            <span className="flex items-center gap-1 text-white">
              <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span>LOGO</span>
            </span>
            <span className="text-[0.52rem] font-bold text-sky-100">
              Logo Wipe
            </span>
          </button>

          {/* DESIGN 2 (NEW): ARENA SHUTTER SPLIT DOORS */}
          <button
            type="button"
            onClick={() => handleLogoTransitionToLive("split_doors")}
            className={`w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border px-2 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              selectedTransitionDesign === "split_doors"
                ? "border-amber-300 ring-1 ring-amber-400/60"
                : "border-purple-400/40"
            }`}
            title="Design 2: Solid Arena Shutter Doors Split Transition with Center Logo Lock"
          >
            <span className="flex items-center gap-1 text-white">
              <Layout className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span>DOORS</span>
            </span>
            <span className="text-[0.52rem] font-bold text-purple-100">
              Split Gate
            </span>
          </button>

          {/* DESIGN 3 (NEW): DIAMOND SHIELD BURST */}
          <button
            type="button"
            onClick={() => handleLogoTransitionToLive("diamond_burst")}
            className={`w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border px-2 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              selectedTransitionDesign === "diamond_burst"
                ? "border-amber-300 ring-1 ring-amber-400/60"
                : "border-emerald-400/40"
            }`}
            title="Design 3: Solid Geometric Shield Burst Logo Transition"
          >
            <span className="flex items-center gap-1 text-white">
              <Layers className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span>SHIELD</span>
            </span>
            <span className="text-[0.52rem] font-bold text-emerald-100">
              Diamond Burst
            </span>
          </button>

          {/* TRANSITION DURATION SELECTOR */}
          <div className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 flex flex-col items-center gap-1">
            <span className="text-[0.5rem] font-black uppercase tracking-wider text-slate-400 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5 text-amber-400" />
              <span>Duration</span>
            </span>
            <select
              value={transitionDurationMs}
              onChange={(e) =>
                handleUpdateTransitionDuration(Number(e.target.value))
              }
              className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 py-1 px-1 text-[0.58rem] font-black text-amber-300 text-center cursor-pointer focus:outline-none focus:border-amber-400"
              title="Select Broadcast Transition Duration"
            >
              <option value={300}>300ms (Fast)</option>
              <option value={500}>500ms (Quick)</option>
              <option value={850}>850ms (Normal)</option>
              <option value={1200}>1200ms (Smooth)</option>
              <option value={1500}>1500ms (Slow)</option>
              <option value={2000}>2000ms (Epic)</option>
            </select>
          </div>

          {/* UPLOAD TRANSITION LOGO (E.G. LEAGUE LOGO) */}
          <div className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 flex flex-col items-center gap-1">
            {effectiveTransitionLogoUrl ? (
              <img
                src={effectiveTransitionLogoUrl}
                alt="Transition Logo"
                className="h-7 w-7 rounded-full object-cover border border-amber-400/60 bg-white"
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
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 px-2 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md transition-all cursor-pointer flex flex-col items-center gap-0.5"
            title={`Solid Broadcast Wipe (${transitionDurationMs}ms) from Preview to Live`}
          >
            <span className="flex items-center gap-1">
              <span>WIPE</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.52rem] font-bold text-slate-800">
              {transitionDurationMs}ms
            </span>
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-rose-950/60 border-b border-rose-500/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded bg-rose-600 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                PROGRAM / LIVE (RIGHT)
              </span>
              <span className="rounded bg-rose-950/90 px-2 py-0.5 text-[0.62rem] font-black text-rose-200 border border-rose-500/40 truncate">
                {liveScene?.kind === "replay_scene"
                  ? `⚡ ON AIR: SLOW-MO REPLAY (${liveScene.replayConfig?.playbackRate}x)`
                  : `🔴 ON AIR: ${liveScene?.name}`}
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

          <div className="studio-video-viewport relative aspect-video w-full bg-black flex items-center justify-center">
            <canvas
              ref={liveCanvasRef}
              width={1920}
              height={1080}
              className="w-full h-full object-contain"
            />
          </div>

          {/* LIVE BROADCAST GRAPHICS QUICK TOGGLES: TEAM COMPARISON PER STAT, TOP PERFORMERS PER TEAM, SPONSOR ADS & REPLAY GAME CLOCK */}
          <div className="px-3 py-1.5 bg-[#101726] border-t border-rose-500/30 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={showTeamComparisonOverlay}
                  onClick={() => {
                    setShowTeamComparisonOverlay((v) => {
                      const next = !v;
                      if (next) {
                        setLiveFeaturedPlayerId("");
                        setShowTopPerformersOverlay(false);
                      }
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all ${
                    showTeamComparisonOverlay
                      ? "bg-amber-500 border-amber-300 text-slate-950 shadow"
                      : "bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-400"
                  }`}
                  title="Show or hide Team Comparison Stats Overlay on the Live Broadcast"
                >
                  <span>
                    📊{" "}
                    {showTeamComparisonOverlay
                      ? `Team Compare (${teamComparisonStatKey}) ON`
                      : "Team Comparison Stats"}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={showTopPerformersOverlay}
                  onClick={() => {
                    setShowTopPerformersOverlay((v) => {
                      const next = !v;
                      if (next) {
                        setLiveFeaturedPlayerId("");
                        setShowTeamComparisonOverlay(false);
                      }
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all ${
                    showTopPerformersOverlay
                      ? "bg-violet-500 border-violet-300 text-white shadow"
                      : "bg-slate-900 border-slate-700 text-slate-200 hover:border-violet-400"
                  }`}
                  title="Show or hide Top Performer Per Team Layer on the Live Broadcast"
                >
                  <span>
                    🏆 {showTopPerformersOverlay ? "Top Performers ON" : "Top Performer Per Team"}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={showAdOverlay}
                  onClick={() => setShowAdOverlay((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all ${
                    showAdOverlay
                      ? "bg-emerald-500 border-emerald-300 text-slate-950 shadow"
                      : "bg-slate-900 border-slate-700 text-slate-200 hover:border-emerald-400"
                  }`}
                  title="Show or hide the uploaded Sponsor Advertisement Image Overlay on the Live Broadcast"
                >
                  <span>
                    📢 {showAdOverlay ? "Ad Overlay ON" : "Sponsor Ad Overlay"} ({adItems.length})
                  </span>
                </button>

                {adItems.length > 1 && showAdOverlay && (
                  <select
                    aria-label="Select Active Advertisement Image"
                    value={activeAdItem?.id || ""}
                    onChange={(e) => setActiveAdId(e.target.value)}
                    className="rounded-lg border border-emerald-500/40 bg-slate-950 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-300"
                  >
                    {adItems.map((ad, idx) => (
                      <option key={ad.id} value={ad.id}>
                        Ad #{idx + 1}: {ad.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-700 px-2 py-0.5 text-[0.6rem] font-black text-amber-300 cursor-pointer"
                title="When replaying raw camera footage, optionally show the official Game Clock timer (ideal for buzzer-beater reviews)"
              >
                <input
                  type="checkbox"
                  checked={showReplayGameClock}
                  onChange={(e) => setShowReplayGameClock(e.target.checked)}
                  className="h-3 w-3 rounded accent-amber-400"
                />
                <span>⏱️ Show Game Clock in Replay</span>
              </label>
            </div>

            {/* Per-Stat Team Comparison Quick Filter Chips + Top Performer Criterion Pills */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.55rem] font-black uppercase tracking-wider text-amber-300 mr-0.5">
                  Compare Stat:
                </span>
                {(
                  [
                    { key: "ALL", label: "ALL STATS" },
                    { key: "FG", label: "FG" },
                    { key: "3PT", label: "3PT" },
                    { key: "FT", label: "FT" },
                    { key: "REB", label: "REB" },
                    { key: "AST", label: "AST" },
                    { key: "STL", label: "STL" },
                    { key: "BLK", label: "BLK" },
                    { key: "TOV", label: "TOV" },
                    { key: "PF", label: "FOULS" },
                  ] as const
                ).map((item) => {
                  const isActive =
                    showTeamComparisonOverlay && teamComparisonStatKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        if (showTeamComparisonOverlay && teamComparisonStatKey === item.key) {
                          setShowTeamComparisonOverlay(false);
                        } else {
                          setTeamComparisonStatKey(item.key);
                          setShowTeamComparisonOverlay(true);
                          setShowTopPerformersOverlay(false);
                          setLiveFeaturedPlayerId("");
                        }
                      }}
                      className={`rounded px-1.5 py-0.5 text-[0.56rem] font-black uppercase cursor-pointer border transition-all ${
                        isActive
                          ? "bg-amber-500 border-amber-300 text-slate-950 shadow"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-400/60"
                      }`}
                      title={`Compare teams by ${item.label} on Live Broadcast`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.55rem] font-black uppercase tracking-wider text-violet-300 mr-0.5">
                  Top Performer:
                </span>
                {(
                  [
                    { key: "OVERALL", label: "⭐ Overall" },
                    { key: "PTS", label: "🏀 PTS" },
                    { key: "REB", label: "💪 REB" },
                    { key: "AST", label: "🎯 AST" },
                  ] as const
                ).map((crit) => {
                  const isActive =
                    showTopPerformersOverlay && topPerformerCriterion === crit.key;
                  return (
                    <button
                      key={crit.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        if (showTopPerformersOverlay && topPerformerCriterion === crit.key) {
                          setShowTopPerformersOverlay(false);
                        } else {
                          setTopPerformerCriterion(crit.key);
                          setShowTopPerformersOverlay(true);
                          setShowTeamComparisonOverlay(false);
                          setLiveFeaturedPlayerId("");
                        }
                      }}
                      className={`rounded px-1.5 py-0.5 text-[0.56rem] font-black uppercase cursor-pointer border transition-all ${
                        isActive
                          ? "bg-violet-500 border-violet-300 text-white shadow"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-violet-400/60"
                      }`}
                    >
                      {crit.label}
                    </button>
                  );
                })}
              </div>
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
          SWITCHABLE WORKSPACE CONTAINER: CAMERA TIMELINE <-> SCENES AND LIVE
         ===================================================================== */}
      <div className="flex-1 flex flex-col">
        {/* =====================================================================
            3. CAMERA TIMELINE • REPLAY INSPECTOR & LIVE PLAY-BY-PLAY
           ===================================================================== */}
        <section
          className={`p-3 sm:p-4 bg-[#101520] border-b border-slate-800 space-y-3 ${
            topSection === "timeline" ? "order-1" : "order-2"
          }`}
        >
          {/* TOP TIMELINE HEADER: TITLE, JUMP TO LATEST TIME, SAVED RECORD PICKER, ZOOM, ORDER SWITCH & HIDE/SHOW */}
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
              {showTimeline && (
                <button
                  type="button"
                  onClick={handleJumpToLatestTime}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider text-slate-950 shadow cursor-pointer transition-colors"
                  title="Jump Playhead, Replay Box, and Timeline Scrollbar to the latest recorded timestamp"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Jump to Latest Time</span>
                </button>
              )}
            </div>

            {/* Right: Saved Recording Picker + Zoom In/Out Controls + Move Top/Bottom + Hide/Show Button */}
            <div className="flex flex-wrap items-center gap-2">
              {showTimeline && (
                <>
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
                      className="w-20 sm:w-24 accent-sky-400 cursor-pointer"
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
                </>
              )}

              {/* Switch Top/Bottom Order Button */}
              <button
                type="button"
                onClick={() => handleSwapTopSection()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-amber-300 hover:text-white transition-colors cursor-pointer"
                title={
                  topSection === "timeline"
                    ? "Move Camera Timeline below Scenes and Live"
                    : "Move Camera Timeline to Top (above Scenes and Live)"
                }
              >
                {topSection === "timeline" ? (
                  <>
                    <ArrowDown className="h-3 w-3 text-amber-400" />
                    <span>Move Below Scenes &amp; Live</span>
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-3 w-3 text-amber-400" />
                    <span>Move to Top</span>
                  </>
                )}
              </button>

              {/* Hide / Show Timeline Button */}
              <button
                type="button"
                onClick={() => toggleShowTimeline()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                title={showTimeline ? "Hide Camera Timeline" : "Show Camera Timeline"}
              >
                {showTimeline ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 text-amber-400" />
                    <span>Show Timeline</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showTimeline && (
            <>
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
          {/* MULTI-CAMERA TIMELINE TRACK SELECTOR & REPLAY GAME CLOCK OPTION */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#111724] px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.65rem] font-black uppercase tracking-wider text-amber-400 mr-1">
                🎥 Active Camera Timeline ({availableStudioCameras.length}):
              </span>
              {availableStudioCameras.map((camTrack) => {
                const isSelectedCam = selectedTimelineCameraKey === camTrack.cameraId;
                return (
                  <button
                    key={camTrack.cameraId}
                    type="button"
                    onClick={() => setSelectedTimelineCameraKey(camTrack.cameraId)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.65rem] font-black uppercase transition-all cursor-pointer border ${
                      isSelectedCam
                        ? "bg-amber-400 border-amber-300 text-slate-950 shadow"
                        : "bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-400/60"
                    }`}
                    title={`Switch timeline & Replay Inspector to ${camTrack.label} (Raw camera footage without scorebug)`}
                  >
                    <span>
                      {camTrack.cameraId === "clean_program"
                        ? "🎬"
                        : camTrack.sourceType === "wireless_phone"
                          ? "📱"
                          : "🎥"}
                    </span>
                    <span>{camTrack.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-emerald-300">
                ✓ Raw Camera Footage (No Scorebug Baked In)
              </span>
              <label
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 px-2.5 py-1 text-[0.62rem] font-black text-amber-300 cursor-pointer"
                title="Show official Game Clock timer on Replay (ideal for buzzer beater & referee clock review)"
              >
                <input
                  type="checkbox"
                  checked={showReplayGameClock}
                  onChange={(e) => setShowReplayGameClock(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-amber-400"
                />
                <span>⏱️ Show Game Clock on Replay (Buzzer Beater Timer)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* LEFT COLS: REPLAY INSPECTOR (TEST & RUN REPLAY BEFORE PUTTING IT IN LIVE) */}
            <div className="lg:col-span-3 flex flex-col justify-between rounded-xl border border-amber-500/40 bg-[#121722] p-2.5 space-y-2 shadow-lg">
              <div className="space-y-1.5">
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

                {/* Camera Angle Selector inside Replay Inspector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.58rem] font-black uppercase text-slate-400 shrink-0">
                    🎥 Cam:
                  </span>
                  <select
                    aria-label="Select Camera for Replay Inspector"
                    value={selectedTimelineCameraKey}
                    onChange={(e) => setSelectedTimelineCameraKey(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-amber-500/40 bg-slate-900 px-2 py-1 text-[0.62rem] font-black text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    {availableStudioCameras.map((camTrack) => (
                      <option key={camTrack.cameraId} value={camTrack.cameraId}>
                        {camTrack.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interactive Replay Inspector Video Monitor */}
              <div className="studio-video-viewport relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-slate-700 flex items-center justify-center">
                <video
                  ref={timelineScrubVideoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-contain ${
                    (activeCameraTimelineVideo && activeCameraTimelineVideo.sizeBytes > 1000) ||
                    isPlayingInspectorReplay
                      ? "block"
                      : "hidden"
                  }`}
                />
                {(!isPlayingInspectorReplay ||
                  !activeCameraTimelineVideo ||
                  activeCameraTimelineVideo.sizeBytes <= 1000) &&
                  activePlayheadFrame && (
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

            {/* RIGHT COLS: STEADY UNCOMPRESSED HORIZONTAL SCROLLABLE MULTI-TRACK TIMELINE */}
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
                      TRACK 3: ACTIVE SELECTED CAMERA FILMSTRIP + STEADY 10-SECOND DRAGGABLE REPLAY BOX
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
                    {/* Sticky Active Camera Header + 1-Click Replay Buttons */}
                    <div className="sticky left-2 top-1.5 z-30 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/95 border border-amber-400/60 px-2 py-0.5 shadow-md">
                      <span className="text-[0.58rem] font-black uppercase text-amber-300">
                        🎯 Active:{" "}
                        {availableStudioCameras.find(
                          (c) => c.cameraId === selectedTimelineCameraKey
                        )?.label || "Main Program Cam"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCreateReplaySceneFromTimeline(
                            false,
                            selectedTimelineCameraKey
                          );
                        }}
                        className="rounded bg-emerald-600 hover:bg-emerald-500 px-1.5 py-0.2 text-[0.52rem] font-black uppercase text-white cursor-pointer"
                        title="Create Replay Scene in Preview from this camera track"
                      >
                        + Cue Replay
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCreateReplaySceneFromTimeline(
                            true,
                            selectedTimelineCameraKey
                          );
                        }}
                        className="rounded bg-rose-600 hover:bg-rose-500 px-1.5 py-0.2 text-[0.52rem] font-black uppercase text-white cursor-pointer"
                        title="Push instant slow-mo Replay to Live from this camera track"
                      >
                        ⚡ Live Replay
                      </button>
                    </div>

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
                      TRACK 4+: INDIVIDUAL MULTI-CAMERA TIMELINE TRACKS
                      (Every camera has its own timeline row & 1-click Replay!)
                     ========================================================= */}
                  {availableStudioCameras
                    .filter((c) => c.cameraId !== "clean_program")
                    .map((camTrack) => {
                      const isActiveTrack =
                        selectedTimelineCameraKey === camTrack.cameraId;
                      const camSpecificVideo = resolveStoredVideoForCamera(
                        camTrack.cameraId
                      );
                      const camFrames: TimelineFrame[] = isRecording
                        ? liveRecordingFramesByCam[camTrack.cameraId] ||
                          rollingTimelineFramesByCam[camTrack.cameraId] ||
                          []
                        : camSpecificVideo?.timelineFrames ||
                          liveRecordingFramesByCam[camTrack.cameraId] ||
                          rollingTimelineFramesByCam[camTrack.cameraId] ||
                          [];

                      return (
                        <div
                          key={camTrack.cameraId}
                          className={`relative h-16 w-full border-t overflow-hidden transition-colors ${
                            isActiveTrack
                              ? "bg-amber-950/20 border-amber-500/50"
                              : "bg-slate-950/90 border-slate-800/90 hover:bg-slate-900/80"
                          }`}
                          onClick={(e) => {
                            setSelectedTimelineCameraKey(camTrack.cameraId);
                            const sec = clientXToTimelineSec(e.clientX);
                            handleScrubTimeline(sec);
                          }}
                          onDoubleClick={(e) => {
                            setSelectedTimelineCameraKey(camTrack.cameraId);
                            const sec = clientXToTimelineSec(e.clientX);
                            handleSnapBoxToSecond(sec, replayBoxDurationPreset);
                          }}
                        >
                          {/* Sticky Left Camera Track Header + Instant Replay Button */}
                          <div className="sticky left-2 top-1.5 z-20 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/95 border border-slate-700 px-2 py-0.5 shadow-md">
                            <span
                              className={`text-[0.58rem] font-black uppercase ${
                                isActiveTrack ? "text-amber-300" : "text-slate-200"
                              }`}
                            >
                              🎥 {camTrack.label}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTimelineCameraKey(camTrack.cameraId);
                                void handleCreateReplaySceneFromTimeline(
                                  false,
                                  camTrack.cameraId
                                );
                              }}
                              className="rounded bg-emerald-600 hover:bg-emerald-500 px-1.5 py-0.2 text-[0.52rem] font-black uppercase text-white cursor-pointer"
                              title={`Create Replay Scene in Preview using raw footage from ${camTrack.label}`}
                            >
                              + Cue Replay
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTimelineCameraKey(camTrack.cameraId);
                                void handleCreateReplaySceneFromTimeline(
                                  true,
                                  camTrack.cameraId
                                );
                              }}
                              className="rounded bg-rose-600 hover:bg-rose-500 px-1.5 py-0.2 text-[0.52rem] font-black uppercase text-white cursor-pointer"
                              title={`Push instant slow-mo Replay to Live using raw footage from ${camTrack.label}`}
                            >
                              ⚡ Live Replay
                            </button>
                          </div>

                          {/* Camera Track Filmstrip Frames */}
                          {camFrames.map((f, idx) => {
                            const tileLeft = f.timeSec * timelineZoomPxPerSec;
                            return (
                              <div
                                key={idx}
                                style={{
                                  left: `${tileLeft}px`,
                                  width: `${timelineZoomPxPerSec}px`,
                                }}
                                className="absolute top-0 bottom-0 border-r border-slate-800/70 overflow-hidden cursor-pointer"
                              >
                                <img
                                  src={f.dataUrl}
                                  alt={`${camTrack.label} ${f.timeSec}s`}
                                  draggable={false}
                                  className="h-full w-full object-cover opacity-75 hover:opacity-100 pointer-events-none"
                                />
                                <span className="absolute bottom-0.5 right-1 rounded bg-black/75 px-1 text-[0.48rem] font-mono text-slate-300 pointer-events-none">
                                  {formatClock(f.timeSec)}
                                </span>
                              </div>
                            );
                          })}

                          {/* Interactive Replay Selection Range on this Camera Track (Draggable IN/OUT + Move) */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTimelineCameraKey(camTrack.cameraId);
                            }}
                            onPointerDown={(e) => {
                              setSelectedTimelineCameraKey(camTrack.cameraId);
                              startTimelineDrag(e, "box_move");
                            }}
                            onPointerMove={(e) => moveTimelineDrag(e, "box_move")}
                            onPointerUp={endTimelineDrag}
                            onLostPointerCapture={endTimelineDrag}
                            style={{
                              left: `${trimStartSec * timelineZoomPxPerSec}px`,
                              width: `${Math.max(
                                24,
                                (trimEndSec - trimStartSec) * timelineZoomPxPerSec
                              )}px`,
                              touchAction: "none",
                              userSelect: "none",
                            }}
                            className={`absolute top-0 bottom-0 z-10 border-2 rounded cursor-grab active:cursor-grabbing ${
                              isActiveTrack
                                ? "bg-amber-400/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                                : "bg-sky-500/10 border-sky-400/60 hover:border-amber-400"
                            }`}
                            title={`Drag to move Replay Box on ${camTrack.label} (${formatClock(
                              trimStartSec
                            )}–${formatClock(trimEndSec)})`}
                          >
                            {/* Left Trim Handle [IN] */}
                            <div
                              onPointerDown={(e) => {
                                setSelectedTimelineCameraKey(camTrack.cameraId);
                                startTimelineDrag(e, "box_left");
                              }}
                              onPointerMove={(e) => moveTimelineDrag(e, "box_left")}
                              onPointerUp={endTimelineDrag}
                              onLostPointerCapture={endTimelineDrag}
                              style={{ touchAction: "none", userSelect: "none" }}
                              className="absolute left-0 top-0 bottom-0 w-2 bg-amber-400/90 hover:bg-white cursor-ew-resize"
                              title="Drag left edge to adjust Replay Start [IN]"
                            />
                            {/* Right Trim Handle [OUT] */}
                            <div
                              onPointerDown={(e) => {
                                setSelectedTimelineCameraKey(camTrack.cameraId);
                                startTimelineDrag(e, "box_right");
                              }}
                              onPointerMove={(e) => moveTimelineDrag(e, "box_right")}
                              onPointerUp={endTimelineDrag}
                              onLostPointerCapture={endTimelineDrag}
                              style={{ touchAction: "none", userSelect: "none" }}
                              className="absolute right-0 top-0 bottom-0 w-2 bg-amber-400/90 hover:bg-white cursor-ew-resize"
                              title="Drag right edge to adjust Replay End [OUT]"
                            />
                          </div>
                        </div>
                      );
                    })}

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

            {/* Right: Camera Angle Selector, Slow-Mo Speed, Replay Scene Label & Create Replay Scene Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Camera Angle Selector for Replay */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-800 px-2 py-1">
                <span className="text-[0.62rem] font-black uppercase text-amber-400">
                  🎥 Replay Cam:
                </span>
                <select
                  aria-label="Select Camera Angle for Replay"
                  value={selectedTimelineCameraKey}
                  onChange={(e) => setSelectedTimelineCameraKey(e.target.value)}
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-xs font-black text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer max-w-[210px]"
                >
                  {availableStudioCameras.map((camTrack) => (
                    <option key={camTrack.cameraId} value={camTrack.cameraId}>
                      {camTrack.label}
                    </option>
                  ))}
                </select>
              </div>

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
            </>
          )}
        </section>

        {/* =====================================================================
            4. SCENES AND LIVE: SCENES | SOURCES | SCOREBUG & OVERLAY | FACEBOOK LIVE & STORAGE
           ===================================================================== */}
        <section
          className={`p-3 sm:p-4 bg-[#0b0e14] border-b border-slate-800 space-y-3 ${
            topSection === "scenes_and_live" ? "order-1" : "order-2"
          }`}
        >
          {/* SCENES AND LIVE SECTION HEADER BAR */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                Scenes and Live • Sources, Scorebug &amp; Broadcast Controls
              </h2>
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[0.62rem] font-black uppercase text-emerald-300">
                {scenes.length} Scenes
              </span>
              <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[0.62rem] font-black uppercase text-sky-300">
                {previewScene?.cameras.length || (previewScene?.mediaConfig ? 1 : 0)} Cam • {audioSources.length} Audio
              </span>
              {isStreamingLive && (
                <span className="rounded-md bg-rose-600/20 border border-rose-500/40 px-2 py-0.5 text-[0.62rem] font-black uppercase text-rose-300 animate-pulse">
                  ● Live Stream On Air
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Switch Top/Bottom Order Button */}
              <button
                type="button"
                onClick={() => handleSwapTopSection()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-300 hover:text-white transition-colors cursor-pointer"
                title={
                  topSection === "scenes_and_live"
                    ? "Move Scenes and Live below Camera Timeline"
                    : "Move Scenes and Live to Top (above Camera Timeline)"
                }
              >
                {topSection === "scenes_and_live" ? (
                  <>
                    <ArrowDown className="h-3 w-3 text-emerald-400" />
                    <span>Move Below Timeline</span>
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-3 w-3 text-emerald-400" />
                    <span>Move to Top</span>
                  </>
                )}
              </button>

              {/* Hide / Show Scenes and Live Button */}
              <button
                type="button"
                onClick={() => toggleShowScenesAndLive()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                title={showScenesAndLive ? "Hide Scenes and Live" : "Show Scenes and Live"}
              >
                {showScenesAndLive ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 text-emerald-400" />
                    <span>Show Scenes &amp; Live</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showScenesAndLive && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 text-xs">
                <p className="font-black text-amber-300 uppercase">
                  🎬 Replay Scene Selected
                </p>
                <p className="text-slate-300 text-[0.7rem]">
                  Camera: <strong className="text-amber-300">{previewScene.replayConfig?.cameraLabel || "Program Clean Feed"}</strong>
                </p>
                <p className="text-slate-300 text-[0.7rem]">
                  Window: <strong>{formatClock(previewScene.replayConfig?.startSec || 0)}</strong> to{" "}
                  <strong>{formatClock(previewScene.replayConfig?.endSec || 0)}</strong> at{" "}
                  <strong>{previewScene.replayConfig?.playbackRate}x Slow-Mo</strong>
                </p>

                {/* Switch Replay Camera Angle directly inside Replay Scene settings */}
                <div className="space-y-1 pt-1 border-t border-amber-500/20">
                  <label className="text-[0.62rem] font-black uppercase text-amber-300 block">
                    🎥 Switch Replay Camera Angle:
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {availableStudioCameras.map((camTrack) => {
                      const isCurrentReplayCam =
                        (previewScene.replayConfig?.cameraId || "clean_program") ===
                        camTrack.cameraId;
                      return (
                        <button
                          key={camTrack.cameraId}
                          type="button"
                          onClick={() =>
                            void handleSwitchReplaySceneCamera(
                              previewScene.id,
                              camTrack.cameraId
                            )
                          }
                          className={`rounded-lg px-2 py-1 text-[0.6rem] font-black uppercase cursor-pointer border transition-all ${
                            isCurrentReplayCam
                              ? "bg-amber-400 border-amber-300 text-slate-950 shadow"
                              : "bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-400"
                          }`}
                        >
                          {camTrack.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

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

                        {/* Direct 1-Click Replay Actions for this Camera Slot */}
                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                          <span className="text-[0.56rem] font-black uppercase text-slate-400 truncate">
                            🎬 Instant Replay ({slot.angleName || slot.label}):
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const camKey =
                                  slot.sourceType === "wireless_phone"
                                    ? `wireless:${(slot.wirelessRoomCode || slot.id).trim().toUpperCase()}`
                                    : `slot:${slot.id}`;
                                setSelectedTimelineCameraKey(camKey);
                                void handleCreateReplaySceneFromTimeline(false, camKey);
                              }}
                              className="rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 text-[0.55rem] font-black uppercase text-white cursor-pointer"
                              title={`Create a Replay Scene in Preview using raw footage from ${slot.angleName || slot.label}`}
                            >
                              + Cue Replay
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const camKey =
                                  slot.sourceType === "wireless_phone"
                                    ? `wireless:${(slot.wirelessRoomCode || slot.id).trim().toUpperCase()}`
                                    : `slot:${slot.id}`;
                                setSelectedTimelineCameraKey(camKey);
                                void handleCreateReplaySceneFromTimeline(true, camKey);
                              }}
                              className="rounded bg-rose-600 hover:bg-rose-500 px-2 py-0.5 text-[0.55rem] font-black uppercase text-white cursor-pointer"
                              title={`Push instant slow-mo Replay to Live using raw footage from ${slot.angleName || slot.label}`}
                            >
                              ⚡ Live Replay
                            </button>
                          </div>
                        </div>
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
                        ? "bg-amber-500 border-amber-300 text-slate-950"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                    }`}
                  >
                    {isAwayInPenalty
                      ? `● BONUS ON (${awayPeriodFouls}/${bonusThreshold} PF)`
                      : `Bonus Off (${awayPeriodFouls}/${bonusThreshold} PF)`}
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
                        ? "bg-amber-500 border-amber-300 text-slate-950"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                    }`}
                  >
                    {isHomeInPenalty
                      ? `● BONUS ON (${homePeriodFouls}/${bonusThreshold} PF)`
                      : `Bonus Off (${homePeriodFouls}/${bonusThreshold} PF)`}
                  </button>
                </div>
              </div>
            </div>

            {/* Transition Stinger Logo Upload, Design & Duration Control */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] font-black uppercase text-amber-300">
                  ✨ Transition Effect Logo & Design
                </span>
                {effectiveTransitionLogoUrl && (
                  <img
                    src={effectiveTransitionLogoUrl}
                    alt="Transition Logo"
                    className="h-6 w-6 rounded-full object-contain bg-white border border-amber-400/50 p-0.5"
                  />
                )}
              </div>

              {/* 3 Broadcast Transition Design Selectors */}
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => handleLogoTransitionToLive("slash_wipe")}
                  className={`rounded-lg px-2 py-1 text-[0.58rem] font-black uppercase cursor-pointer border transition-all ${
                    selectedTransitionDesign === "slash_wipe"
                      ? "bg-indigo-600 border-amber-300 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  1. Slash Wipe
                </button>
                <button
                  type="button"
                  onClick={() => handleLogoTransitionToLive("split_doors")}
                  className={`rounded-lg px-2 py-1 text-[0.58rem] font-black uppercase cursor-pointer border transition-all ${
                    selectedTransitionDesign === "split_doors"
                      ? "bg-purple-600 border-amber-300 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  2. Split Doors
                </button>
                <button
                  type="button"
                  onClick={() => handleLogoTransitionToLive("diamond_burst")}
                  className={`rounded-lg px-2 py-1 text-[0.58rem] font-black uppercase cursor-pointer border transition-all ${
                    selectedTransitionDesign === "diamond_burst"
                      ? "bg-emerald-600 border-amber-300 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  3. Shield Burst
                </button>
              </div>

              {/* Transition Duration Quick Selector */}
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[0.58rem] font-black uppercase text-slate-400">
                  Duration:
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {[300, 500, 850, 1200, 1500, 2000].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => handleUpdateTransitionDuration(ms)}
                      className={`rounded px-1.5 py-0.5 text-[0.55rem] font-black cursor-pointer border transition-all ${
                        transitionDurationMs === ms
                          ? "bg-amber-500 border-amber-300 text-slate-950"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {ms}ms
                    </button>
                  ))}
                </div>
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
                  onClick={() => handleLogoTransitionToLive()}
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

            {/* TEAM COMPARISON STATS OVERLAY CONTROL (ALL STATS OR PER STAT: FG, REB, ETC.) */}
            <div className="rounded-lg border border-sky-500/30 bg-sky-950/15 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] font-black uppercase text-sky-300">
                  📊 Team Comparison ({teamComparisonStatKey})
                </span>
                <button
                  type="button"
                  aria-pressed={showTeamComparisonOverlay}
                  onClick={() => {
                    setShowTeamComparisonOverlay((v) => {
                      const next = !v;
                      if (next) {
                        setLiveFeaturedPlayerId("");
                        setShowTopPerformersOverlay(false);
                      }
                      return next;
                    });
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all ${
                    showTeamComparisonOverlay
                      ? "bg-amber-500 border-amber-300 text-slate-950 shadow"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  {showTeamComparisonOverlay ? "● Showing on Live" : "Show on Live"}
                </button>
              </div>
              <p className="text-[0.6rem] text-slate-400">
                Select <strong className="text-slate-200">ALL</strong> for the full comparison table or click any stat (<strong className="text-slate-200">FG, 3PT, FT, REB, AST, STL, BLK, TOV, PF</strong>) for a broadcast lower-third comparison banner.
              </p>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { key: "ALL", label: "ALL" },
                    { key: "FG", label: "FG" },
                    { key: "3PT", label: "3PT" },
                    { key: "FT", label: "FT" },
                    { key: "REB", label: "REB" },
                    { key: "AST", label: "AST" },
                    { key: "STL", label: "STL" },
                    { key: "BLK", label: "BLK" },
                    { key: "TOV", label: "TOV" },
                    { key: "PF", label: "PF" },
                  ] as const
                ).map((st) => {
                  const active = teamComparisonStatKey === st.key;
                  return (
                    <button
                      key={st.key}
                      type="button"
                      aria-pressed={active && showTeamComparisonOverlay}
                      onClick={() => {
                        setTeamComparisonStatKey(st.key);
                        setShowTeamComparisonOverlay(true);
                        setShowTopPerformersOverlay(false);
                        setLiveFeaturedPlayerId("");
                      }}
                      className={`rounded py-1 text-[0.58rem] font-black uppercase cursor-pointer border transition-all ${
                        active && showTeamComparisonOverlay
                          ? "bg-amber-500 border-amber-300 text-slate-950 shadow"
                          : active
                          ? "bg-sky-600/30 border-sky-400 text-sky-200"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TOP PERFORMER PER TEAM OVERLAY LAYER CONTROL */}
            <div className="rounded-lg border border-violet-500/30 bg-violet-950/15 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] font-black uppercase text-violet-300">
                  🏆 Top Performer Per Team Layer
                </span>
                <button
                  type="button"
                  aria-pressed={showTopPerformersOverlay}
                  onClick={() => {
                    setShowTopPerformersOverlay((v) => {
                      const next = !v;
                      if (next) {
                        setLiveFeaturedPlayerId("");
                        setShowTeamComparisonOverlay(false);
                      }
                      return next;
                    });
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all ${
                    showTopPerformersOverlay
                      ? "bg-violet-500 border-violet-300 text-white shadow"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  {showTopPerformersOverlay ? "● Showing on Live" : "Show on Live"}
                </button>
              </div>
              <p className="text-[0.6rem] text-slate-400">
                Displays a dual broadcast graphic featuring the #1 Top Performer from each team side-by-side (PTS, REB, AST, FG, STL/BLK).
              </p>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { key: "OVERALL", label: "⭐ Overall" },
                    { key: "PTS", label: "🏀 PTS" },
                    { key: "REB", label: "💪 REB" },
                    { key: "AST", label: "🎯 AST" },
                  ] as const
                ).map((crit) => {
                  const active = topPerformerCriterion === crit.key;
                  return (
                    <button
                      key={crit.key}
                      type="button"
                      aria-pressed={active && showTopPerformersOverlay}
                      onClick={() => {
                        setTopPerformerCriterion(crit.key);
                        setShowTopPerformersOverlay(true);
                        setShowTeamComparisonOverlay(false);
                        setLiveFeaturedPlayerId("");
                      }}
                      className={`rounded py-1 text-[0.58rem] font-black uppercase cursor-pointer border transition-all ${
                        active && showTopPerformersOverlay
                          ? "bg-violet-500 border-violet-300 text-white shadow"
                          : active
                          ? "bg-violet-600/30 border-violet-400 text-violet-200"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {crit.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <div>
                  <label className="block text-[0.54rem] font-black uppercase text-slate-400 mb-0.5">
                    {awayScorebugName} Leader:
                  </label>
                  <select
                    value={manualAwayTopPerformerId}
                    onChange={(e) => setManualAwayTopPerformerId(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[0.6rem] font-bold text-white"
                  >
                    <option value="">
                      Auto Best (
                      {awayTopPerformer
                        ? `#${awayTopPerformer.jerseyNumber} ${awayTopPerformer.lastName}`
                        : "None"}
                      )
                    </option>
                    {allAwayPlayers.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        #{p.jerseyNumber} {p.firstName} {p.lastName} ({p.points || 0} PTS,{" "}
                        {(p.oreb || 0) + (p.dreb || 0)} REB, {p.ast || 0} AST)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[0.54rem] font-black uppercase text-slate-400 mb-0.5">
                    {homeScorebugName} Leader:
                  </label>
                  <select
                    value={manualHomeTopPerformerId}
                    onChange={(e) => setManualHomeTopPerformerId(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[0.6rem] font-bold text-white"
                  >
                    <option value="">
                      Auto Best (
                      {homeTopPerformer
                        ? `#${homeTopPerformer.jerseyNumber} ${homeTopPerformer.lastName}`
                        : "None"}
                      )
                    </option>
                    {allHomePlayers.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        #{p.jerseyNumber} {p.firstName} {p.lastName} ({p.points || 0} PTS,{" "}
                        {(p.oreb || 0) + (p.dreb || 0)} REB, {p.ast || 0} AST)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* MULTIPLE ADVERTISEMENT IMAGES & OVERLAY POSITION SELECTOR */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] font-black uppercase text-emerald-300">
                  📢 Sponsor Advertisement Images ({adItems.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdOverlay((v) => !v)}
                  disabled={adItems.length === 0}
                  className={`rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer border transition-all disabled:opacity-40 ${
                    showAdOverlay && adItems.length > 0
                      ? "bg-emerald-500 border-emerald-300 text-slate-950 shadow"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  {showAdOverlay && adItems.length > 0 ? "● Ad Overlay ON" : "Overlay OFF"}
                </button>
              </div>

              {/* Upload Multiple Advertisement Images */}
              <div className="flex items-center gap-1.5">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600/25 hover:bg-emerald-600/40 px-2.5 py-1.5 text-[0.62rem] font-black uppercase text-emerald-200 cursor-pointer">
                  <Upload className="h-3 w-3" />
                  <span>+ Upload Ad Images (Multi)</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadAdImages}
                    className="hidden"
                  />
                </label>

                {adItems.length > 1 && (
                  <label className="inline-flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-[0.58rem] font-bold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRotateAds}
                      onChange={(e) => setAutoRotateAds(e.target.checked)}
                      className="h-3 w-3 rounded accent-emerald-500"
                    />
                    <span>Auto-Rotate (8s)</span>
                  </label>
                )}
              </div>

              {/* Advertisement Overlay Layout / Position Selector */}
              <div className="space-y-1">
                <label className="block text-[0.58rem] font-black uppercase text-slate-400">
                  Advertisement Overlay Position / Style:
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: "bottom_right_card", label: "Bottom-Right Card" },
                      { id: "top_right_card", label: "Top-Right Card" },
                      { id: "bottom_center_banner", label: "Bottom Banner" },
                      { id: "top_left_card", label: "Top-Left Card" },
                      { id: "fullscreen_commercial", label: "Full-Screen Ad" },
                    ] as Array<{ id: AdOverlayLayout; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAdOverlayLayout(opt.id)}
                      className={`rounded py-1 px-1.5 text-[0.58rem] font-black uppercase border cursor-pointer truncate ${
                        adOverlayLayout === opt.id
                          ? "bg-emerald-600 border-emerald-400 text-white"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Uploaded Advertisement Image Gallery (Click to Select Active Ad) */}
              {adItems.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 pt-1 max-h-36 overflow-y-auto">
                  {adItems.map((ad) => {
                    const isSelected = activeAdItem?.id === ad.id;
                    return (
                      <div
                        key={ad.id}
                        onClick={() => {
                          setActiveAdId(ad.id);
                          setShowAdOverlay(true);
                        }}
                        className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all ${
                          isSelected
                            ? "border-emerald-400 ring-2 ring-emerald-500/40 bg-slate-900"
                            : "border-slate-800 bg-slate-950 opacity-80 hover:opacity-100"
                        }`}
                        title={`Click to display "${ad.name}" on the broadcast overlay`}
                      >
                        <img
                          src={ad.dataUrl}
                          alt={ad.name}
                          className="h-12 w-full object-contain bg-black"
                        />
                        <div className="px-1 py-0.5 bg-slate-950 text-[0.52rem] font-bold text-slate-200 truncate">
                          {ad.name}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAdItem(ad.id);
                          }}
                          className="absolute top-0.5 right-0.5 rounded bg-rose-600/90 hover:bg-rose-500 px-1 text-[0.5rem] font-black text-white cursor-pointer"
                          title="Delete Ad Image"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void runStreamHealthCheck()}
                disabled={isTestingStreamHealth}
                className="rounded bg-emerald-600/20 border border-emerald-500/40 px-2 py-0.5 text-[0.58rem] font-black uppercase text-emerald-300 hover:bg-emerald-600 hover:text-white cursor-pointer disabled:opacity-50"
                title="Test internet upload latency & computer CPU/GPU readiness"
              >
                {isTestingStreamHealth ? "Testing..." : "🩺 Check Health"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFbSetupModal(true);
                  void runStreamHealthCheck();
                }}
                className="rounded bg-blue-600/20 border border-blue-500/40 px-2 py-0.5 text-[0.6rem] font-black uppercase text-blue-300 hover:bg-blue-600 hover:text-white cursor-pointer"
              >
                Setup Guide
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2.5 text-xs overflow-y-auto max-h-[34rem]">
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setStreamKey(val);
                      try {
                        localStorage.setItem("boxscore_studio_stream_key", val);
                      } catch {}
                    }}
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

              {/* Stream Quality / Bitrate Selector (Prevents Green Screen on Slow Internet or High CPU) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[0.6rem] font-black uppercase text-amber-300">
                    Stream Resolution &amp; Internet Load:
                  </label>
                  <span className="text-[0.55rem] text-slate-400">
                    Use 360p/540p if Facebook shows Green Screen
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      {
                        id: "360p",
                        title: "360p Fast",
                        sub: "550 kbps • Slow Net",
                      },
                      {
                        id: "540p",
                        title: "540p Balanced",
                        sub: "1 Mbps • Recommended",
                      },
                      {
                        id: "720p",
                        title: "720p HD",
                        sub: "1.6 Mbps • Fast Fiber",
                      },
                    ] as const
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => void handleSwitchStreamQualityLive(q.id)}
                      className={`rounded-lg border px-1.5 py-1 text-left cursor-pointer transition-all ${
                        streamQualityPreset === q.id
                          ? "border-blue-400 bg-blue-600/30 text-white shadow"
                          : "border-slate-800 bg-slate-900/90 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-[0.62rem] font-black uppercase leading-tight">
                        {q.title}
                      </div>
                      <div className="text-[0.52rem] text-slate-300 truncate">
                        {q.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[0.65rem] font-black uppercase text-blue-400">
                    Facebook Live Public URL (For iOS & Mobile In-App Watching):
                  </label>
                  <span className="text-[0.6rem] text-slate-400">e.g. facebook.com/.../videos/...</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={fbLivePublicUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFbLivePublicUrl(val);
                      try {
                        localStorage.setItem("boxscore_studio_fb_live_url", val);
                      } catch {}
                    }}
                    placeholder="https://www.facebook.com/yourpage/videos/123456789/ or watch link"
                    className="flex-1 rounded-xl border border-blue-500/40 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveAndBroadcastStreamUrl()}
                    className="rounded-xl border border-blue-500 bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer shrink-0"
                    title="Broadcast this Facebook Live URL to all iOS and mobile devices in real-time"
                  >
                    Sync to iOS
                  </button>
                </div>
                {streamSavedNotice && (
                  <p className="mt-1 text-[0.68rem] font-bold text-emerald-400 animate-pulse">
                    ✓ {streamSavedNotice}
                  </p>
                )}
              </div>

              {streamError && (
                <div className="rounded-lg bg-rose-950/70 border border-rose-500/50 px-2.5 py-1.5 text-[0.65rem] font-bold text-rose-200 space-y-1">
                  <div>⚠️ {streamError}</div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => forceStreamKeyframeResync()}
                      className="rounded bg-amber-500 hover:bg-amber-400 px-2 py-0.5 text-[0.58rem] font-black uppercase text-slate-950 cursor-pointer"
                    >
                      🔧 Resync Keyframe Now
                    </button>
                    {streamQualityPreset !== "360p" && (
                      <button
                        type="button"
                        onClick={() => void handleSwitchStreamQualityLive("360p")}
                        className="rounded bg-blue-600 hover:bg-blue-500 px-2 py-0.5 text-[0.58rem] font-black uppercase text-white cursor-pointer"
                      >
                        ⚡ Switch to 360p (Low Internet Mode)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!isStreamingLive ? (
                <button
                  type="button"
                  disabled={isConnectingStream}
                  onClick={() => void startRtmpLiveStream()}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>
                    {isConnectingStream
                      ? "Connecting to Facebook Live..."
                      : `Connect & Stream (${streamQualityPreset.toUpperCase()}) to ${streamPlatform === "facebook" ? "Facebook Live" : "YouTube"}`}
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
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => forceStreamKeyframeResync()}
                      className="rounded-xl bg-amber-500 hover:bg-amber-400 px-2.5 py-1.5 text-[0.64rem] font-black uppercase tracking-wider text-slate-950 cursor-pointer"
                      title="Force a fresh full-color H.264 Keyframe + SPS/PPS header to fix green screen on Facebook"
                    >
                      🔧 Fix Green Screen
                    </button>
                    <button
                      type="button"
                      onClick={stopRtmpLiveStream}
                      className="rounded-xl bg-rose-600 hover:bg-rose-500 px-2.5 py-1.5 text-[0.64rem] font-black uppercase tracking-wider text-white cursor-pointer"
                    >
                      Stop Live Stream
                    </button>
                  </div>
                </div>
              )}

              {/* ===============================================================
                  LIVESTREAM HEALTH & GREEN SCREEN DIAGNOSTICS MONITOR
                 =============================================================== */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowStreamHealthDetails((v) => !v)}
                    className="flex items-center gap-1.5 text-left cursor-pointer"
                  >
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[0.65rem] font-black uppercase text-white">
                      Livestream Health &amp; Diagnostics
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.56rem] font-black uppercase ${
                        streamHealth.overallStatus === "critical"
                          ? "bg-rose-600 text-white"
                          : streamHealth.overallStatus === "warning"
                            ? "bg-amber-500 text-slate-950"
                            : streamHealth.overallStatus === "healthy"
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {streamHealth.overallStatus === "critical"
                        ? "🔴 CRITICAL (GREEN SCREEN RISK)"
                        : streamHealth.overallStatus === "warning"
                          ? "🟡 WARNING (LAG / SLOW)"
                          : streamHealth.overallStatus === "healthy"
                            ? "🟢 HEALTHY"
                            : "⚪ READY"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStreamHealthDetails((v) => !v)}
                      className="text-[0.58rem] font-bold text-slate-400 hover:text-white px-1 cursor-pointer"
                    >
                      {showStreamHealthDetails ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {showStreamHealthDetails && (
                  <div className="space-y-1.5 pt-0.5">
                    {/* 1. Internet Connection Check */}
                    <div
                      className={`rounded-lg border p-2 space-y-0.5 ${
                        streamHealth.internetStatus === "critical"
                          ? "border-rose-500/60 bg-rose-950/40"
                          : streamHealth.internetStatus === "slow"
                            ? "border-amber-500/60 bg-amber-950/30"
                            : "border-slate-800 bg-slate-900/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[0.6rem] font-black uppercase text-sky-300">
                          🌐 1. Internet Upload Connection
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[0.55rem] font-black uppercase ${
                            streamHealth.internetStatus === "critical"
                              ? "bg-rose-600 text-white"
                              : streamHealth.internetStatus === "slow"
                                ? "bg-amber-500 text-slate-950"
                                : "bg-emerald-600/30 text-emerald-300"
                          }`}
                        >
                          {streamHealth.internetStatus === "critical"
                            ? "NOT OK • TOO SLOW"
                            : streamHealth.internetStatus === "slow"
                              ? "MODERATE / LAG"
                              : "CONNECTION OK"}
                        </span>
                      </div>
                      <p className="text-[0.58rem] text-slate-200 leading-snug">
                        {streamHealth.internetDiagnosis}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[0.54rem] font-mono text-slate-400 pt-0.5">
                        <span>Ping: {streamHealth.pingLatencyMs}ms</span>
                        <span>•</span>
                        <span>
                          Upload: {streamHealth.uploadBitrateKbps}/{streamHealth.targetBitrateKbps} kbps
                        </span>
                        <span>•</span>
                        <span>Stalls: {streamHealth.networkStallsCount}</span>
                      </div>
                    </div>

                    {/* 2. Computer CPU / GPU Resources Check */}
                    <div
                      className={`rounded-lg border p-2 space-y-0.5 ${
                        streamHealth.computerStatus === "overloaded"
                          ? "border-rose-500/60 bg-rose-950/40"
                          : streamHealth.computerStatus === "high_load"
                            ? "border-amber-500/60 bg-amber-950/30"
                            : "border-slate-800 bg-slate-900/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[0.6rem] font-black uppercase text-violet-300">
                          💻 2. Computer CPU / GPU Resources
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[0.55rem] font-black uppercase ${
                            streamHealth.computerStatus === "overloaded"
                              ? "bg-rose-600 text-white"
                              : streamHealth.computerStatus === "high_load"
                                ? "bg-amber-500 text-slate-950"
                                : "bg-emerald-600/30 text-emerald-300"
                          }`}
                        >
                          {streamHealth.computerStatus === "overloaded"
                            ? "OVERLOADED"
                            : streamHealth.computerStatus === "high_load"
                              ? "HIGH LOAD"
                              : "RESOURCES OK"}
                        </span>
                      </div>
                      <p className="text-[0.58rem] text-slate-200 leading-snug">
                        {streamHealth.computerDiagnosis}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[0.54rem] font-mono text-slate-400 pt-0.5">
                        <span>
                          FPS: {streamHealth.encodingFps}/{streamHealth.targetFps}
                        </span>
                        <span>•</span>
                        <span>Encoder Queue: {streamHealth.encoderQueueSize}</span>
                        <span>•</span>
                        <span>
                          CPU: {streamHealth.cpuCores} cores
                          {streamHealth.deviceMemoryGb ? ` / ${streamHealth.deviceMemoryGb}GB RAM` : ""}
                        </span>
                      </div>
                    </div>

                    {/* 3. Why Green Screen Happens & Decoder Status */}
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.6rem] font-black uppercase text-emerald-300">
                          🟩 3. Why Green Screen Happens &amp; Auto-Guard
                        </span>
                        <span className="rounded bg-emerald-600/30 px-1.5 py-0.2 text-[0.54rem] font-black uppercase text-emerald-200">
                          {streamHealth.keyframesSent} Keyframes
                        </span>
                      </div>
                      <p className="text-[0.58rem] text-emerald-100 leading-snug">
                        {streamHealth.greenScreenDiagnosis}
                      </p>
                      <div className="rounded bg-slate-950/80 border border-slate-800 p-1.5 text-[0.55rem] text-slate-300 space-y-0.5 leading-relaxed">
                        <p className="font-bold text-amber-300">
                          Why did Facebook Live turn Green?
                        </p>
                        <p>
                          • <strong>1. Slow Internet / Timeout (`Timed out connecting...`):</strong>{" "}
                          When upload lags, full H.264 Keyframes (I-frames) get delayed and only partial difference frames (P-frames) reach Facebook. Facebook&apos;s YUV420p decoder renders missing reference frames as <code className="text-emerald-400">Y=0, U=0, V=0</code> (solid green).
                        </p>
                        <p>
                          • <strong>2. Heavy Computer Load:</strong> Running 2-Cam Split Screen + Scorebug + Recording at 720p 30fps can overload CPU/GPU &amp; upload bandwidth.
                        </p>
                        <p>
                          • <strong>How to Fix Immediately:</strong> Click{" "}
                          <strong className="text-amber-300">&ldquo;🔧 Fix Green Screen&rdquo;</strong>{" "}
                          or select <strong className="text-blue-300">360p Fast / 540p Balanced</strong> above.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
            </div>
          )}
        </section>
      </div>

      {/* =====================================================================
          5. FACEBOOK PAGE LIVE PRODUCER SETUP MODAL
         ===================================================================== */}
      {showFbSetupModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowFbSetupModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-blue-500/40 bg-[#131926] p-5 shadow-2xl space-y-3.5 text-slate-100 max-h-[92vh] overflow-y-auto"
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
            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-2 text-xs">
              <p className="font-black uppercase text-amber-400 text-[0.68rem]">
                How to Connect Your Facebook Page (3 Quick Steps):
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
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

            {/* Pre-Flight & Live Stream Health Summary inside Modal */}
            <div className="rounded-xl border border-slate-700 bg-slate-950/90 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[0.68rem] font-black uppercase text-emerald-300 flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5" />
                  Computer Resources &amp; Internet Health Check
                </span>
                <button
                  type="button"
                  onClick={() => void runStreamHealthCheck()}
                  disabled={isTestingStreamHealth}
                  className="rounded-lg bg-emerald-600/25 border border-emerald-500/40 hover:bg-emerald-600 px-2.5 py-1 text-[0.6rem] font-black uppercase text-emerald-200 hover:text-white cursor-pointer"
                >
                  {isTestingStreamHealth ? "Checking..." : "🩺 Re-Test Now"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[0.6rem] font-black uppercase text-sky-300">
                      🌐 Internet Upload
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[0.55rem] font-black uppercase ${
                        streamHealth.internetStatus === "critical"
                          ? "bg-rose-600 text-white"
                          : streamHealth.internetStatus === "slow"
                            ? "bg-amber-500 text-slate-950"
                            : "bg-emerald-600/30 text-emerald-300"
                      }`}
                    >
                      {streamHealth.internetStatus === "critical"
                        ? "SLOW / RISK"
                        : streamHealth.internetStatus === "slow"
                          ? "MODERATE"
                          : "OK"}
                    </span>
                  </div>
                  <p className="text-[0.6rem] text-slate-300 leading-snug">
                    {streamHealth.internetDiagnosis}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[0.6rem] font-black uppercase text-violet-300">
                      💻 Computer CPU/GPU
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[0.55rem] font-black uppercase ${
                        streamHealth.computerStatus === "overloaded"
                          ? "bg-rose-600 text-white"
                          : streamHealth.computerStatus === "high_load"
                            ? "bg-amber-500 text-slate-950"
                            : "bg-emerald-600/30 text-emerald-300"
                      }`}
                    >
                      {streamHealth.computerStatus === "overloaded"
                        ? "OVERLOADED"
                        : streamHealth.computerStatus === "high_load"
                          ? "HIGH LOAD"
                          : "OK"}
                    </span>
                  </div>
                  <p className="text-[0.6rem] text-slate-300 leading-snug">
                    {streamHealth.computerDiagnosis}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-[0.6rem] font-black uppercase text-amber-300 mb-1">
                  Select Stream Quality (Use 360p or 540p to Prevent Green Screen on Slow Internet):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "360p", label: "360p Fast (550 kbps)" },
                      { id: "540p", label: "540p Balanced (1 Mbps)" },
                      { id: "720p", label: "720p HD (1.6 Mbps)" },
                    ] as const
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => void handleSwitchStreamQualityLive(q.id)}
                      className={`rounded-lg py-1.5 px-2 text-[0.62rem] font-black uppercase border cursor-pointer ${
                        streamQualityPreset === q.id
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setStreamKey(val);
                      try {
                        localStorage.setItem("boxscore_studio_stream_key", val);
                      } catch {}
                    }}
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

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[0.65rem] font-black uppercase text-blue-400">
                    Facebook Live Public URL (For iOS & Mobile In-App Watching):
                  </label>
                  <span className="text-[0.6rem] text-slate-400">e.g. facebook.com/.../videos/...</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={fbLivePublicUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFbLivePublicUrl(val);
                      try {
                        localStorage.setItem("boxscore_studio_fb_live_url", val);
                      } catch {}
                    }}
                    placeholder="https://www.facebook.com/yourpage/videos/123456789/ or watch link"
                    className="flex-1 rounded-xl border border-blue-500/40 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveAndBroadcastStreamUrl()}
                    className="rounded-xl border border-blue-500 bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer shrink-0"
                    title="Broadcast this Facebook Live URL to all iOS and mobile devices in real-time"
                  >
                    Sync to iOS
                  </button>
                </div>
                {streamSavedNotice && (
                  <p className="mt-1 text-[0.68rem] font-bold text-emerald-400 animate-pulse">
                    ✓ {streamSavedNotice}
                  </p>
                )}
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
                        : `Connect & Stream (${streamQualityPreset.toUpperCase()})`}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => forceStreamKeyframeResync()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg cursor-pointer"
                    >
                      <span>🔧 Fix Green Screen</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopRtmpLiveStream}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg cursor-pointer"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>Stop Streaming ({formatClock(streamDurationSec)})</span>
                    </button>
                  </div>
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
