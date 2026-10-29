"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Camera,
  Check,
  Circle,
  Copy,
  Download,
  Film,
  Grid,
  HardDrive,
  Layers,
  Layout,
  Monitor,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Scissors,
  Settings,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Tv,
  Video,
  Zap,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  StoredGameVideo,
  TimelineFrame,
  saveVideoToIndexedDB,
  getAllStoredVideos,
  deleteStoredVideo,
} from "@/lib/video-storage";
import { generateUUID } from "@/lib/uuid";
import { LiveGameSession } from "@/types/boxscore";

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

export interface SceneCameraSlot {
  id: string;
  label: string;
  sourceType: "camera" | "screen" | "court_sim";
  deviceId: string;
  angleName: string;
}

export interface ReplayClipConfig {
  videoId: string;
  videoTitle: string;
  startSec: number;
  endSec: number;
  playbackRate: number;
}

export interface StudioScene {
  id: string;
  name: string;
  kind: "camera_scene" | "replay_scene";
  layout: SceneLayoutMode;
  cameras: SceneCameraSlot[];
  replayConfig?: ReplayClipConfig;
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

  // Hardware Video Devices & Active Streams Map (keyed by slot.id)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeSlotIds, setActiveSlotIds] = useState<Record<string, boolean>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamBySlotRef = useRef<Record<string, MediaStream>>({});
  const videoElBySlotRef = useRef<Record<string, HTMLVideoElement>>({});

  // Scorebug Overlay Customization
  const [scorebugPosition, setScorebugPosition] = useState<"bottom_bar" | "top_corner">("bottom_bar");
  const [scorebugTheme, setScorebugTheme] = useState<"broadcast_dark" | "clean_light">("broadcast_dark");
  const [showShotClock, setShowShotClock] = useState<boolean>(true);
  const [showSponsorTag, setShowSponsorTag] = useState<boolean>(true);
  const [sponsorText, setSponsorText] = useState<string>("BOX SCORE LIVE");

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
  const [trimEndSec, setTrimEndSec] = useState<number>(8);
  const [selectedReplaySpeed, setSelectedReplaySpeed] = useState<number>(0.5);
  const [replayClipLabel, setReplayClipLabel] = useState<string>("");
  const [timelineNotice, setTimelineNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
  const previewReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveReplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrubVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveCaptureFramesRef = useRef<TimelineFrame[]>([]);
  const recordStartTimeRef = useRef<number>(0);

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
  const homeColor = homeTeam?.primaryColor ?? "#8B0D0E";
  const awayColor = awayTeam?.primaryColor ?? "#0B2F5C";

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

  // Enumerate Camera Devices
  const refreshCameraDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(vInputs);
    } catch {
      // Ignore before permissions granted
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
  }, [refreshCameraDevices]);

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

  // Start Camera or Screen Stream for a specific Slot
  const startCameraSlot = async (slot: SceneCameraSlot) => {
    setCameraError(null);
    if (slot.sourceType === "court_sim") {
      setActiveSlotIds((prev) => ({ ...prev, [slot.id]: true }));
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
    if (streamBySlotRef.current[slotId]) {
      streamBySlotRef.current[slotId].getTracks().forEach((t) => t.stop());
      delete streamBySlotRef.current[slotId];
    }
    if (videoElBySlotRef.current[slotId]) {
      videoElBySlotRef.current[slotId].srcObject = null;
    }
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

      const vidEl = videoElBySlotRef.current[slot.id];
      const isStreamReady =
        slot.sourceType !== "court_sim" &&
        activeSlotIds[slot.id] &&
        vidEl &&
        vidEl.readyState >= 2;

      if (isStreamReady && vidEl) {
        // Draw live webcam / capture card stream with object-cover scaling
        const vw = vidEl.videoWidth || 1280;
        const vh = vidEl.videoHeight || 720;
        const scale = Math.max(rw / vw, rh / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = rx + (rw - dw) / 2;
        const dy = ry + (rh - dh) / 2;
        ctx.drawImage(vidEl, dx, dy, dw, dh);
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

      // Camera Angle Label Pill in top-left of its viewport
      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      ctx.beginPath();
      ctx.roundRect(rx + 16, ry + 16, 220, 32, [8]);
      ctx.fill();

      ctx.fillStyle = isStreamReady ? "#4ade80" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(rx + 30, ry + 32, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "800 12px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        (slot.angleName || slot.label).slice(0, 22).toUpperCase(),
        rx + 42,
        ry + 32
      );

      ctx.restore();
    },
    [activeSlotIds, awayTeamName, awayScore, homeScore, homeTeamName, clockSeconds]
  );

  // Helper: Draw Scorebug Overlay
  const drawScorebugOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const isDark = scorebugTheme !== "clean_light";
      const bgPrimary = isDark ? "rgba(11, 27, 48, 0.94)" : "rgba(255, 255, 255, 0.96)";
      const textColor = isDark ? "#ffffff" : "#0f172a";
      const subTextColor = isDark ? "#94a3b8" : "#64748b";
      const borderColor = isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.14)";

      ctx.save();

      if (scorebugPosition === "bottom_bar") {
        const bugW = 860;
        const bugH = 76;
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

        // Away Team
        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 12, bugY + 10, 8, bugH - 20, [4]);
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(awayTeamName.slice(0, 12).toUpperCase(), bugX + 30, bugY + bugH / 2);

        ctx.font = "900 34px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(awayScore), bugX + 270, bugY + bugH / 2);

        // Divider
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.moveTo(bugX + 290, bugY + 12);
        ctx.lineTo(bugX + 290, bugY + bugH - 12);
        ctx.stroke();

        // Home Team
        ctx.font = "900 34px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(String(homeScore), bugX + 310, bugY + bugH / 2);

        ctx.fillStyle = textColor;
        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.fillText(homeTeamName.slice(0, 12).toUpperCase(), bugX + 380, bugY + bugH / 2);

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 620, bugY + 10, 8, bugH - 20, [4]);
        ctx.fill();

        // Clock & Period Box
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
        ctx.beginPath();
        ctx.roundRect(bugX + 640, bugY + 8, bugW - 648, bugH - 16, [12]);
        ctx.fill();

        ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
        ctx.font = "900 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatClock(clockSeconds), bugX + 705, bugY + 28);

        ctx.fillStyle = subTextColor;
        ctx.font = "800 12px 'Inter', sans-serif";
        ctx.fillText(getPeriodLabel(period).toUpperCase(), bugX + 705, bugY + 52);

        if (showShotClock) {
          ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
          ctx.font = "900 28px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(String(shotClock), bugX + 795, bugY + bugH / 2);
        }
      } else {
        // Top-Left Corner Scorebug
        const bugW = 420;
        const bugH = 100;
        const bugX = 36;
        const bugY = 58;

        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = bgPrimary;
        ctx.beginPath();
        ctx.roundRect(bugX, bugY, bugW, bugH, [16]);
        ctx.fill();

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.shadowColor = "transparent";

        ctx.fillStyle = awayColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 12, bugY + 12, 6, 32, [3]);
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.font = "900 17px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(awayTeamName.slice(0, 14).toUpperCase(), bugX + 28, bugY + 28);

        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(awayScore), bugX + 250, bugY + 28);

        ctx.fillStyle = homeColor;
        ctx.beginPath();
        ctx.roundRect(bugX + 12, bugY + 56, 6, 32, [3]);
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.font = "900 17px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(homeTeamName.slice(0, 14).toUpperCase(), bugX + 28, bugY + 72);

        ctx.font = "900 22px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(homeScore), bugX + 250, bugY + 72);

        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
        ctx.beginPath();
        ctx.roundRect(bugX + 270, bugY + 12, bugW - 282, bugH - 24, [10]);
        ctx.fill();

        ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
        ctx.font = "900 20px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatClock(clockSeconds), bugX + 345, bugY + 36);

        ctx.fillStyle = subTextColor;
        ctx.font = "800 11px 'Inter', sans-serif";
        ctx.fillText(getPeriodLabel(period).toUpperCase(), bugX + 345, bugY + 56);

        if (showShotClock) {
          ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
          ctx.font = "900 18px 'Inter', sans-serif";
          ctx.fillText(`SC: ${shotClock}s`, bugX + 345, bugY + 74);
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
      awayTeamName,
      awayScore,
      homeScore,
      homeTeamName,
      homeColor,
      isClockRunning,
      clockSeconds,
      period,
      showShotClock,
      shotClock,
      showSponsorTag,
      sponsorText,
    ]
  );

  // Render any StudioScene onto a target Canvas (used for both Left Preview & Right Live Program)
  const renderSceneToCanvas = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      scene: StudioScene | undefined,
      replayVidEl: HTMLVideoElement | null,
      drawOverlay: boolean,
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

        // Broadcast Slow-Motion Replay Banner
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

      if (drawOverlay) {
        drawScorebugOverlay(ctx, width, height);
      }
    },
    [drawCameraSlotRect, drawScorebugOverlay]
  );

  // Dual-Monitor Continuous Render Loop (Left = Preview Canvas, Right = Live Program Canvas)
  useEffect(() => {
    let isRunning = true;
    let rafId: number;

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
            showOverlayInPreview,
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
            true,
            nowMs
          );
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
    };
  }, [previewScene, liveScene, showOverlayInPreview, renderSceneToCanvas]);

  // OBS Transition Actions: CUT & FADE
  const handleCutToLive = () => {
    setLiveSceneId(previewSceneId);
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

  // Capture a small thumbnail from Live Canvas for the Bottom Camera Timeline
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
      return {
        timeSec: sec,
        dataUrl: thumbCanvas.toDataURL("image/jpeg", 0.6),
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
      // Attach any active microphone/audio tracks
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
        setTrimStartSec(Math.max(0, elapsedSec - 6));
        setTrimEndSec(elapsedSec);
        setTimelinePlayheadSec(Math.max(0, elapsedSec - 6));
        setIsRecording(false);
        setRecordSeconds(0);
        setTimelineNotice(
          `✓ Saved ${elapsedSec}s recording to Camera Timeline! Select an In/Out range below to create a Replay Scene.`
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

  // Create a Replay Scene from the selected Timeline In/Out range!
  const handleCreateReplaySceneFromTimeline = (pushImmediatelyToLive = false) => {
    if (!selectedTimelineVideo) {
      alert("Record a game clip first so you can select a replay segment on the timeline.");
      return;
    }

    const start = Math.max(0, Math.min(trimStartSec, trimEndSec - 0.5));
    const end = Math.max(start + 1, Math.min(trimEndSec, selectedTimelineVideo.durationSeconds || 60));

    const customTitle =
      replayClipLabel.trim() ||
      `Replay (${formatClock(start)}-${formatClock(end)} @ ${selectedReplaySpeed}x)`;

    const newReplayScene: StudioScene = {
      id: `scene-replay-${generateUUID().slice(0, 6)}`,
      name: `🎬 ${customTitle}`,
      kind: "replay_scene",
      layout: "single",
      cameras: [],
      replayConfig: {
        videoId: selectedTimelineVideo.id,
        videoTitle: selectedTimelineVideo.title,
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
        ? `⚡ Replay Scene "${customTitle}" created and pushed LIVE on Program!`
        : `✓ Replay Scene "${customTitle}" added to Scenes & cued on Left Preview Monitor!`
    );
    setTimeout(() => setTimelineNotice(null), 5000);
  };

  const handleScrubTimeline = (sec: number) => {
    const maxDur = selectedTimelineVideo?.durationSeconds || 10;
    const clamped = Math.max(0, Math.min(maxDur, sec));
    setTimelinePlayheadSec(clamped);
    if (timelineScrubVideoRef.current) {
      timelineScrubVideoRef.current.currentTime = clamped;
    }
  };

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

  const activeTimelineDuration = Math.max(
    1,
    isRecording ? Math.max(10, recordSeconds) : selectedTimelineVideo?.durationSeconds || 10
  );
  const displayTimelineFrames = isRecording
    ? liveRecordingFrames
    : selectedTimelineVideo?.timelineFrames || [];

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans select-none">
      {/* Hidden Replay & Scrub Video Elements */}
      <video ref={previewReplayVideoRef} playsInline muted className="hidden" />
      <video ref={liveReplayVideoRef} playsInline muted className="hidden" />
      <video ref={timelineScrubVideoRef} playsInline muted className="hidden" />

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
                : `🎥 ${previewScene?.cameras.length || 0} Camera(s) • Layout: ${previewScene?.layout.toUpperCase()}`}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: OBS STUDIO MODE TRANSITION BAR */}
        <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-2 p-2 rounded-xl border border-slate-800 bg-[#131926]">
          <span className="hidden lg:block text-[0.62rem] font-black uppercase tracking-widest text-slate-400 text-center">
            Transition
          </span>

          <button
            type="button"
            onClick={handleCutToLive}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 px-3 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all cursor-pointer flex flex-col items-center gap-1"
            title="Instant Cut from Left Preview to Right Live Output"
          >
            <span className="flex items-center gap-1">
              <span>CUT</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.58rem] font-bold text-rose-200">Instant</span>
          </button>

          <button
            type="button"
            onClick={handleFadeToLive}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md transition-all cursor-pointer flex flex-col items-center gap-1"
            title="Smooth 300ms Fade from Preview to Live"
          >
            <span className="flex items-center gap-1">
              <span>FADE</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[0.58rem] font-bold text-slate-800">300ms</span>
          </button>

          <button
            type="button"
            onClick={handleSwapPreviewAndLive}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-2 text-[0.68rem] font-black uppercase text-slate-200 cursor-pointer flex items-center justify-center gap-1"
            title="Swap Preview and Live Scenes"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-sky-400" />
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
        </div>
      </section>

      {/* =====================================================================
          3. BOTTOM LIVE RECORD & CAMERA TIMELINE DOCK (CREATE REPLAY SCENES FROM TIMELINE!)
         ===================================================================== */}
      <section className="p-3 sm:p-4 bg-[#101520] border-b border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Film className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Live Recording &amp; Camera Timeline (Select Segment to Create Slow-Mo Replay Scene)
            </h2>
            {isRecording && (
              <span className="rounded-md bg-rose-600/20 border border-rose-500/40 px-2 py-0.5 text-[0.65rem] font-black text-rose-300 animate-pulse">
                Capturing Live Timeline Frames ({recordSeconds}s)...
              </span>
            )}
          </div>

          {/* Saved Recording Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[0.68rem] font-black uppercase text-slate-400">
              Saved Record on Timeline:
            </label>
            <select
              value={selectedTimelineVideoId}
              onChange={(e) => {
                const vid = storedVideos.find((v) => v.id === e.target.value);
                setSelectedTimelineVideoId(e.target.value);
                if (vid) {
                  setTrimStartSec(0);
                  setTrimEndSec(Math.max(2, Math.min(vid.durationSeconds, 8)));
                  setTimelinePlayheadSec(0);
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
                  <span>Save File</span>
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

        {/* VISUAL CAMERA FILMSTRIP TIMELINE TRACK */}
        <div className="rounded-xl border border-slate-800 bg-[#0b0e15] p-3 space-y-3">
          {/* Filmstrip Track + Highlighted Trim Overlay */}
          <div className="relative h-24 w-full rounded-lg overflow-hidden border border-slate-700 bg-slate-900 select-none">
            {/* Thumbnail Frames along the timeline */}
            {displayTimelineFrames.length > 0 ? (
              <div className="flex h-full w-full">
                {displayTimelineFrames.map((f, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleScrubTimeline(f.timeSec)}
                    className="relative flex-1 h-full border-r border-slate-800/80 cursor-pointer group overflow-hidden"
                    title={`Jump to ${formatClock(f.timeSec)}`}
                  >
                    <img
                      src={f.dataUrl}
                      alt={`Frame ${f.timeSec}s`}
                      className="h-full w-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.2 text-[0.55rem] font-mono text-slate-300">
                      {formatClock(f.timeSec)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-slate-500 gap-1">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Camera Timeline Ready
                </p>
                <p className="text-[0.68rem] text-slate-500">
                  Click &quot;Start Live Record&quot; to record the game. Live camera frames will populate along this timeline so you can highlight any play for slow-motion replay!
                </p>
              </div>
            )}

            {/* Selected Replay Trim Window Overlay (IN [ -> OUT ]) */}
            {selectedTimelineVideo && !isRecording && (
              <div
                className="absolute top-0 bottom-0 bg-amber-500/25 border-x-4 border-amber-400 pointer-events-none flex items-start justify-between px-1.5 pt-1"
                style={{
                  left: `${Math.min(100, (trimStartSec / activeTimelineDuration) * 100)}%`,
                  width: `${Math.max(
                    2,
                    Math.min(
                      100,
                      ((trimEndSec - trimStartSec) / activeTimelineDuration) * 100
                    )
                  )}%`,
                }}
              >
                <span className="rounded bg-amber-400 px-1 py-0.2 text-[0.58rem] font-black text-slate-950">
                  IN [{formatClock(trimStartSec)}
                </span>
                <span className="rounded bg-amber-400 px-1 py-0.2 text-[0.58rem] font-black text-slate-950">
                  {formatClock(trimEndSec)}] OUT
                </span>
              </div>
            )}

            {/* Playhead Indicator Line */}
            {selectedTimelineVideo && !isRecording && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none"
                style={{
                  left: `${Math.min(100, (timelinePlayheadSec / activeTimelineDuration) * 100)}%`,
                }}
              >
                <div className="h-3 w-3 -ml-1.25 rounded-full bg-rose-500 border border-white shadow" />
              </div>
            )}
          </div>

          {/* Interactive Timeline Sliders (Scrub Playhead, IN Start, OUT End) + Replay Scene Creator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center pt-1">
            {/* Left 6 cols: Range Sliders & Quick Trim Presets */}
            <div className="lg:col-span-6 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Playhead Scrubber */}
                <div className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5">
                  <div className="flex justify-between text-[0.65rem] font-black uppercase text-slate-400">
                    <span>Playhead</span>
                    <span className="text-rose-400 font-mono">
                      {formatPreciseTime(timelinePlayheadSec)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={activeTimelineDuration}
                    step={0.1}
                    value={timelinePlayheadSec}
                    onChange={(e) => handleScrubTimeline( Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                {/* Trim Start (IN [) */}
                <div className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5">
                  <div className="flex justify-between text-[0.65rem] font-black uppercase text-amber-400">
                    <span>[ Replay Start</span>
                    <span className="font-mono">{formatPreciseTime(trimStartSec)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.5, trimEndSec - 0.5)}
                    step={0.5}
                    value={trimStartSec}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTrimStartSec(val);
                      handleScrubTimeline(val);
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Trim End (OUT ]) */}
                <div className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5">
                  <div className="flex justify-between text-[0.65rem] font-black uppercase text-amber-400">
                    <span>Replay End ]</span>
                    <span className="font-mono">{formatPreciseTime(trimEndSec)}</span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(activeTimelineDuration, trimStartSec + 1)}
                    max={activeTimelineDuration}
                    step={0.5}
                    value={trimEndSec}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTrimEndSec(val);
                      handleScrubTimeline(val);
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Quick Mark In / Out Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTrimStartSec(Math.min(timelinePlayheadSec, trimEndSec - 1))}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[0.65rem] font-black uppercase text-amber-300 cursor-pointer"
                >
                  [ Mark In Here
                </button>
                <button
                  type="button"
                  onClick={() => setTrimEndSec(Math.max(timelinePlayheadSec, trimStartSec + 1))}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[0.65rem] font-black uppercase text-amber-300 cursor-pointer"
                >
                  Mark Out Here ]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dur = activeTimelineDuration;
                    setTrimStartSec(Math.max(0, dur - 5));
                    setTrimEndSec(dur);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-slate-300 cursor-pointer"
                >
                  Last 5s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dur = activeTimelineDuration;
                    setTrimStartSec(Math.max(0, dur - 10));
                    setTrimEndSec(dur);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-slate-300 cursor-pointer"
                >
                  Last 10s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrimStartSec(0);
                    setTrimEndSec(activeTimelineDuration);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[0.65rem] font-bold text-slate-300 cursor-pointer"
                >
                  Full Clip
                </button>
              </div>
            </div>

            {/* Right 6 cols: Slow-Mo Speed, Replay Name & Create Replay Scene Buttons */}
            <div className="lg:col-span-6 flex flex-wrap items-center justify-end gap-2">
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
                onClick={() => handleCreateReplaySceneFromTimeline(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer"
                title="Create a selectable Replay Scene from this timeline segment and cue it on Left Preview"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>Create Replay Scene (Preview)</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateReplaySceneFromTimeline(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md cursor-pointer"
                title="Create Replay Scene and immediately air it on Right Live Output"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Instant Replay to Live</span>
              </button>
            </div>
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

          {/* Add New Scene Footer */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/60 flex items-center gap-1.5">
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
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* DOCK 2: MULTI-CAMERA SOURCES & LAYOUT (For Selected Preview Scene) */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-[#131926] overflow-hidden">
          <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-sky-400" />
              2. Cameras in Scene ({previewScene?.cameras.length || 0})
            </span>
            {previewScene?.kind === "camera_scene" && (
              <button
                type="button"
                onClick={handleAddCameraToPreviewScene}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-500 px-2 py-0.5 text-[0.65rem] font-black uppercase text-white cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                Add Camera
              </button>
            )}
          </div>

          <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-80">
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

                {/* Camera Slots List */}
                <div className="space-y-2">
                  {previewScene?.cameras.map((slot, idx) => {
                    const isActive = Boolean(activeSlotIds[slot.id]);
                    return (
                      <div
                        key={slot.id}
                        className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-2.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={slot.angleName}
                            onChange={(e) =>
                              handleUpdateCameraSlot(previewScene.id, slot.id, {
                                angleName: e.target.value,
                              })
                            }
                            className="bg-transparent text-xs font-black text-white focus:outline-none border-b border-transparent focus:border-sky-400 w-40"
                          />
                          <div className="flex items-center gap-1">
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

                        {/* Source Type & Hardware Device Dropdown */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={slot.sourceType}
                            onChange={(e) => {
                              const nextType = e.target.value as SceneCameraSlot["sourceType"];
                              handleUpdateCameraSlot(previewScene.id, slot.id, {
                                sourceType: nextType,
                              });
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[0.65rem] font-bold text-slate-200"
                          >
                            <option value="camera">📷 USB / Webcam</option>
                            <option value="screen">🖥️ Capture Card / Screen</option>
                            <option value="court_sim">🏀 Simulated Court Cam #{idx + 1}</option>
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

          <div className="p-3 space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[0.65rem] font-black uppercase text-slate-400">
                Scoreboard Position:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScorebugPosition("bottom_bar")}
                  className={`rounded-lg py-1.5 text-[0.68rem] font-black uppercase border cursor-pointer ${
                    scorebugPosition === "bottom_bar"
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  Bottom Center Bar
                </button>
                <button
                  type="button"
                  onClick={() => setScorebugPosition("top_corner")}
                  className={`rounded-lg py-1.5 text-[0.68rem] font-black uppercase border cursor-pointer ${
                    scorebugPosition === "top_corner"
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400"
                  }`}
                >
                  Top-Left Bug
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
