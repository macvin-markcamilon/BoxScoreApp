"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Circle,
  Download,
  FastForward,
  FolderDown,
  HardDrive,
  Info,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RefreshCw,
  Repeat,
  Radio,
  Settings,
  Shield,
  Square,
  Trash2,
  Tv,
  Video,
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  Layers,
  ChevronDown,
  Copy,
  Check,
  Film,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  StoredGameVideo,
  saveVideoToIndexedDB,
  getAllStoredVideos,
  deleteStoredVideo,
} from "@/lib/video-storage";
import { generateUUID } from "@/lib/uuid";
import {
  LeagueRecord,
  LeagueTeam,
  LiveGameSession,
  TournamentMatch,
} from "@/types/boxscore";

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPeriodLabel(period: number, maxRegularPeriods = 4): string {
  if (period <= maxRegularPeriods) {
    return maxRegularPeriods === 2 ? `Half ${period}` : `Q${period}`;
  }
  const otIndex = period - maxRegularPeriods;
  return otIndex === 1 ? "OT" : `OT${otIndex}`;
}

export type StorageLocation = "browser_indexeddb" | "local_filesystem" | "download_prompt";

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

  // Selected League & Match state
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  // Video Devices & Source State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [videoSourceType, setVideoSourceType] = useState<"camera" | "screen">("camera");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Scorebug Overlay Customization
  const [scorebugPosition, setScorebugPosition] = useState<"bottom_bar" | "top_bar" | "top_corner">("bottom_bar");
  const [scorebugTheme, setScorebugTheme] = useState<"broadcast_dark" | "clean_light" | "vibrant_neon">("broadcast_dark");
  const [showShotClock, setShowShotClock] = useState<boolean>(true);
  const [showLeagueLogo, setShowLeagueLogo] = useState<boolean>(true);
  const [showSponsorTag, setShowSponsorTag] = useState<boolean>(true);
  const [sponsorText, setSponsorText] = useState<string>("BOX SCORE LIVE");

  // Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [storageLocation, setStorageLocation] = useState<StorageLocation>("browser_indexeddb");

  // Stored Videos & Replay State
  const [storedVideos, setStoredVideos] = useState<StoredGameVideo[]>([]);
  const [replayVideo, setReplayVideo] = useState<StoredGameVideo | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(0.5); // Slow-mo default 0.5x (or 0.25x)
  const [replayLoop, setReplayLoop] = useState<boolean>(true);
  const [isOverlayingReplayOnLive, setIsOverlayingReplayOnLive] = useState<boolean>(false);

  // Streaming Guide Tab
  const [activeControlTab, setActiveControlTab] = useState<"camera" | "scorebug" | "recording" | "replays" | "streaming">("camera");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // References
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const canvasCompositeRef = useRef<HTMLCanvasElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);

  // Initialize DB and load leagues/teams
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
  }, [initializeSession, fetchLeaguesAndTeams, syncFromLocalStorage]);

  // Set initial selected league & match
  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      if (initialLeagueId && leagues.some((l) => l.id === initialLeagueId)) {
        setSelectedLeagueId(initialLeagueId);
      } else {
        setSelectedLeagueId(leagues[0].id);
      }
    }
  }, [leagues, initialLeagueId, selectedLeagueId]);

  // Current selected league object
  const activeLeague = useMemo(() => {
    return leagues.find((l) => l.id === selectedLeagueId) ?? leagues[0] ?? null;
  }, [leagues, selectedLeagueId]);

  // Current matches in the selected league
  const matches = useMemo(() => {
    if (!activeLeague) return [];
    const tourney = tournamentsByLeagueId[activeLeague.id];
    return tourney?.matches ?? [];
  }, [activeLeague, tournamentsByLeagueId]);

  // Match selection update
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

  // Live session for the active match
  const liveSession: LiveGameSession | null = useMemo(() => {
    if (!activeMatch) return null;
    return gameSessionsByMatchId[activeMatch.id] ?? null;
  }, [activeMatch, gameSessionsByMatchId]);

  // Teams info
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

  // Enumerate Cameras & Audio Input Devices
  useEffect(() => {
    async function getDevices() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vInputs = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(vInputs);
        if (vInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(vInputs[0].deviceId);
        }
      } catch {
        // Permissions not granted yet
      }
    }
    getDevices();
  }, [selectedDeviceId]);

  // Start Camera Stream
  const startCamera = async (deviceId?: string) => {
    setCameraError(null);
    try {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const devId = deviceId || selectedDeviceId;
      const constraints: MediaStreamConstraints = {
        video: devId
          ? { deviceId: { exact: devId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setVideoSourceType("camera");

      // Re-enumerate to fetch user-friendly device labels now that permission is active
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to access camera.";
      setCameraError(msg);
      setCameraActive(false);
    }
  };

  // Start Screen Capture (e.g. Window, Game Feed, HDMI Capture Card)
  const startScreenShare = async () => {
    setCameraError(null);
    try {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window" },
        audio: true,
      });
      currentStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setVideoSourceType("screen");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to share screen/capture card.";
      setCameraError(msg);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((t) => t.stop());
      currentStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Continuous Composite Rendering to Offscreen Canvas for OBS / Recordings
  useEffect(() => {
    const canvas = canvasCompositeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const renderFrame = () => {
      if (!isRunning) return;

      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw live camera video or screen share
      if (
        isOverlayingReplayOnLive &&
        replayVideoRef.current &&
        !replayVideoRef.current.paused &&
        !replayVideoRef.current.ended
      ) {
        // Draw Slow-Motion Replay video
        ctx.drawImage(replayVideoRef.current, 0, 0, width, height);

        // Slow-Mo Replay Watermark / Indicator
        ctx.fillStyle = "rgba(225, 29, 72, 0.9)";
        ctx.beginPath();
        ctx.roundRect(40, 40, 220, 44, [10]);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 18px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`⚡ SLOW-MO REPLAY (${replaySpeed}x)`, 150, 62);
      } else if (
        cameraActive &&
        videoPreviewRef.current &&
        videoPreviewRef.current.readyState >= 2
      ) {
        ctx.drawImage(videoPreviewRef.current, 0, 0, width, height);
      } else {
        // Black / Dark Slate arena broadcast background
        ctx.fillStyle = "#090d16";
        ctx.fillRect(0, 0, width, height);

        // Placeholder graphic
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(width / 2, height / 2 - 30, 80, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#64748b";
        ctx.font = "700 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("NO CAMERA FEED SELECTED", width / 2, height / 2 + 80);
        ctx.font = "500 16px 'Inter', sans-serif";
        ctx.fillText("Select a webcam, capture card, or screen share to begin", width / 2, height / 2 + 115);
      }

      // 2. Draw Live Basketball Scorebug Overlay
      drawScorebugOverlay(ctx, width, height);

      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    cameraActive,
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    homeColor,
    awayColor,
    clockSeconds,
    shotClock,
    period,
    isClockRunning,
    scorebugPosition,
    scorebugTheme,
    showShotClock,
    showLeagueLogo,
    showSponsorTag,
    sponsorText,
    isOverlayingReplayOnLive,
    replaySpeed,
  ]);

  // Scorebug rendering logic on Canvas
  const drawScorebugOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const isDark = scorebugTheme !== "clean_light";
    const bgPrimary = isDark ? "rgba(11, 27, 48, 0.94)" : "rgba(255, 255, 255, 0.96)";
    const textColor = isDark ? "#ffffff" : "#0f172a";
    const subTextColor = isDark ? "#94a3b8" : "#64748b";
    const borderColor = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.12)";

    ctx.save();

    if (scorebugPosition === "bottom_bar") {
      // Bottom Center ESPN/FIBA Style Broadcast Ribbon
      const bugW = 860;
      const bugH = 76;
      const bugX = (width - bugW) / 2;
      const bugY = height - bugH - 32;

      // Backdrop shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;

      // Base bar
      ctx.fillStyle = bgPrimary;
      ctx.beginPath();
      ctx.roundRect(bugX, bugY, bugW, bugH, [16]);
      ctx.fill();

      // Border outline
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowColor = "transparent"; // Reset shadow

      // AWAY TEAM Block
      ctx.fillStyle = awayColor;
      ctx.beginPath();
      ctx.roundRect(bugX + 12, bugY + 10, 8, bugH - 20, [4]);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = "900 22px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(awayTeamName.slice(0, 12).toUpperCase(), bugX + 30, bugY + bugH / 2);

      ctx.font = "900 32px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(awayScore), bugX + 270, bugY + bugH / 2);

      // VS Divider
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(bugX + 290, bugY + 12);
      ctx.lineTo(bugX + 290, bugY + bugH - 12);
      ctx.stroke();

      // HOME TEAM Block
      ctx.font = "900 32px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(homeScore), bugX + 310, bugY + bugH / 2);

      ctx.fillStyle = textColor;
      ctx.font = "900 22px 'Inter', sans-serif";
      ctx.fillText(homeTeamName.slice(0, 12).toUpperCase(), bugX + 380, bugY + bugH / 2);

      ctx.fillStyle = homeColor;
      ctx.beginPath();
      ctx.roundRect(bugX + 620, bugY + 10, 8, bugH - 20, [4]);
      ctx.fill();

      // CLOCK & PERIOD Block (Right Section)
      ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
      ctx.beginPath();
      ctx.roundRect(bugX + 640, bugY + 8, bugW - 648, bugH - 16, [12]);
      ctx.fill();

      // Clock Display
      ctx.fillStyle = isClockRunning ? "#38bdf8" : "#f59e0b";
      ctx.font = "900 24px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatClock(clockSeconds), bugX + 700, bugY + 28);

      // Period Display
      ctx.fillStyle = subTextColor;
      ctx.font = "800 12px 'Inter', sans-serif";
      ctx.fillText(getPeriodLabel(period).toUpperCase(), bugX + 700, bugY + 52);

      // Shot Clock Display
      if (showShotClock) {
        ctx.fillStyle = shotClock <= 5 ? "#ef4444" : "#eab308";
        ctx.font = "900 28px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(shotClock), bugX + 790, bugY + bugH / 2);
      }
    } else {
      // Top Left Corner Boxscore Bug
      const bugW = 420;
      const bugH = 100;
      const bugX = 40;
      const bugY = 40;

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

      // Away row
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

      // Home row
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

      // Right Side Time Box
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

    // Top Right Sponsor Watermark
    if (showSponsorTag) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.roundRect(width - 240, 30, 200, 36, [10]);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 13px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`🔴 ${sponsorText}`, width - 140, 48);
    }

    ctx.restore();
  };

  // Refresh recorded videos list from IndexedDB
  const refreshStoredVideos = async () => {
    const list = await getAllStoredVideos();
    setStoredVideos(list);
  };

  // Start Recording from Composite Canvas Stream
  const startRecording = () => {
    const canvas = canvasCompositeRef.current;
    if (!canvas) return;

    try {
      const canvasStream = canvas.captureStream(30); // 30 FPS broadcast
      if (currentStreamRef.current) {
        // Attach audio tracks if available
        const audioTracks = currentStreamRef.current.getAudioTracks();
        audioTracks.forEach((t) => canvasStream.addTrack(t));
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 4_500_000, // 4.5 Mbps HD broadcast bitrate
      });

      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const videoId = generateUUID();
        const duration = recordSeconds;

        // Generate thumbnail
        let thumbnail = "";
        try {
          thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        } catch {}

        const newVideo: StoredGameVideo = {
          id: videoId,
          matchId: activeMatch?.id ?? "generic-game",
          gameNumber: activeMatch?.gameNumber ?? 1,
          title: `Game #${activeMatch?.gameNumber || 1} - ${homeTeamName} vs ${awayTeamName}`,
          blob: finalBlob,
          mimeType,
          sizeBytes: finalBlob.size,
          durationSeconds: duration,
          createdAt: new Date().toISOString(),
          thumbnailDataUrl: thumbnail,
          homeScore,
          awayScore,
          homeTeamName,
          awayTeamName,
        };

        if (storageLocation === "browser_indexeddb") {
          await saveVideoToIndexedDB(newVideo);
          await refreshStoredVideos();
        } else if (storageLocation === "local_filesystem" && "showSaveFilePicker" in window) {
          // Native File System Access API
          try {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName: `Game_${activeMatch?.gameNumber || 1}_${Date.now()}.webm`,
              types: [
                {
                  description: "WebM Video",
                  accept: { "video/webm": [".webm"] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(finalBlob);
            await writable.close();
            // Also keep an entry in IndexedDB for easy slow-mo replay access
            await saveVideoToIndexedDB(newVideo);
            await refreshStoredVideos();
          } catch {
            // Cancelled or unsupported -> save to IndexedDB as fallback
            await saveVideoToIndexedDB(newVideo);
            await refreshStoredVideos();
          }
        } else {
          // Download prompt directly
          const url = URL.createObjectURL(finalBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Game_${activeMatch?.gameNumber || 1}_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          // Keep copy in app for instant slow motion replay
          await saveVideoToIndexedDB(newVideo);
          await refreshStoredVideos();
        }

        setIsRecording(false);
        setRecordSeconds(0);
      };

      recorder.start(1000); // 1-second chunks
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      alert("Failed to start recording. Please check browser permissions.");
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  // Play Replay in Slow Motion
  const handlePlaySlowMotionReplay = (video: StoredGameVideo) => {
    setReplayVideo(video);
    setIsReplayPlaying(true);
    setIsOverlayingReplayOnLive(true); // Broadcast replay onto live feed

    setTimeout(() => {
      if (replayVideoRef.current) {
        const url = URL.createObjectURL(video.blob);
        replayVideoRef.current.src = url;
        replayVideoRef.current.playbackRate = replaySpeed;
        replayVideoRef.current.play().catch(() => {});
      }
    }, 50);
  };

  // Stop Replay
  const handleStopReplay = () => {
    setIsOverlayingReplayOnLive(false);
    setIsReplayPlaying(false);
    if (replayVideoRef.current) {
      replayVideoRef.current.pause();
    }
  };

  // Change Slow Motion Speed
  const handleSpeedChange = (speed: number) => {
    setReplaySpeed(speed);
    if (replayVideoRef.current) {
      replayVideoRef.current.playbackRate = speed;
    }
  };

  // Delete video from DB
  const handleDeleteVideo = async (id: string) => {
    if (confirm("Delete this recorded game clip from storage?")) {
      await deleteStoredVideo(id);
      if (replayVideo?.id === id) {
        handleStopReplay();
        setReplayVideo(null);
      }
      await refreshStoredVideos();
    }
  };

  // Download Video File
  const handleDownloadVideo = (video: StoredGameVideo) => {
    const url = URL.createObjectURL(video.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${video.title.replace(/\s+/g, "_")}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy helper
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Studio Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer shadow-xs"
            title="Exit Broadcast Studio to Dashboard"
          >
            <ArrowLeft className="h-4 w-4 text-[#8B0D0E]" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cameraActive ? "bg-emerald-400" : "bg-rose-400"} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${cameraActive ? "bg-emerald-500" : "bg-rose-500"}`}></span>
            </span>
            <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Radio className="h-4 w-4 text-rose-500" />
              Box Score OBS Broadcast Studio
            </h1>
          </div>
        </div>

        {/* League and Game Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* League Dropdown */}
          <select
            aria-label="Active League"
            value={selectedLeagueId}
            onChange={(e) => setSelectedLeagueId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                🏆 {l.name}
              </option>
            ))}
          </select>

          {/* Match Dropdown */}
          <select
            aria-label="Active Game"
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            {matches.map((m) => {
              const h = teams.find((t) => t.id === m.homeTeamId)?.name || m.homeTeamPlaceholder || "Home";
              const a = teams.find((t) => t.id === m.awayTeamId)?.name || m.awayTeamPlaceholder || "Away";
              return (
                <option key={m.id} value={m.id}>
                  Game #{m.gameNumber}: {h} vs {a}
                </option>
              );
            })}
          </select>

          {/* Live Score Preview Pill */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-1 text-xs font-black">
            <span style={{ color: homeColor }}>{homeTeamName.slice(0, 3)}</span>
            <span className="text-white text-sm">{homeScore}</span>
            <span className="text-slate-500">:</span>
            <span className="text-white text-sm">{awayScore}</span>
            <span style={{ color: awayColor }}>{awayTeamName.slice(0, 3)}</span>
            <span className="ml-1 text-[0.65rem] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded">
              {formatClock(clockSeconds)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Studio Work Area */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* Left: OBS Canvas Preview Screen */}
        <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-slate-950 relative overflow-hidden">
          {/* Main 16:9 Canvas Stage */}
          <div className="relative w-full max-w-5xl aspect-video rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl flex items-center justify-center">
            {/* The actual canvas that mixes Video + Real-Time Live Game Scorebug */}
            <canvas
              ref={canvasCompositeRef}
              width={1920}
              height={1080}
              className="w-full h-full object-contain"
            />

            {/* Hidden Video Source Player for Camera / Screen */}
            <video
              ref={videoPreviewRef}
              playsInline
              muted
              autoPlay
              className="hidden"
            />

            {/* Hidden Replay Video Source for Slow-Mo Compositing */}
            <video
              ref={replayVideoRef}
              playsInline
              muted={false}
              loop={replayLoop}
              onEnded={() => {
                if (!replayLoop) handleStopReplay();
              }}
              className="hidden"
            />

            {/* Live On-Screen Status Watermark */}
            <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
              <span className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
                <span className={`h-2 w-2 rounded-full ${cameraActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                {videoSourceType === "camera" ? "CAMERA FEED (1080p)" : "SCREEN/CAPTURE FEED"}
              </span>

              {isRecording && (
                <span className="flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white shadow-md animate-pulse">
                  <Circle className="h-2 w-2 fill-current" />
                  REC {formatClock(recordSeconds)}
                </span>
              )}

              {isOverlayingReplayOnLive && (
                <span className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-slate-950 shadow-md">
                  ⚡ SLOW-MO REPLAY ACTIVE ({replaySpeed}x)
                </span>
              )}
            </div>

            {/* Quick Action Overlay inside Stage */}
            {isOverlayingReplayOnLive && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-slate-900/90 border border-slate-700 p-2 shadow-2xl backdrop-blur-md">
                <span className="text-xs font-black uppercase text-amber-400 pl-2">
                  Replay Speed:
                </span>
                {[0.25, 0.5, 0.75, 1.0].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => handleSpeedChange(spd)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer transition-colors ${
                      replaySpeed === spd
                        ? "bg-amber-400 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleStopReplay}
                  className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-black uppercase text-white hover:bg-rose-500 cursor-pointer ml-1"
                >
                  Exit Replay
                </button>
              </div>
            )}
          </div>

          {/* Quick Toolbar below video */}
          <div className="mt-4 flex flex-wrap items-center justify-between w-full max-w-5xl gap-3">
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
                >
                  <Circle className="h-4 w-4 fill-current" />
                  Start Recording Game
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-rose-500 text-rose-400 px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer animate-pulse"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop Recording ({formatClock(recordSeconds)})
                </button>
              )}

              {storedVideos.length > 0 && !isOverlayingReplayOnLive && (
                <button
                  type="button"
                  onClick={() => handlePlaySlowMotionReplay(storedVideos[0])}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  title="Instant Slow-Mo Replay of latest clip"
                >
                  <Repeat className="h-4 w-4" />
                  Instant Slow-Mo (Last Clip)
                </button>
              )}
            </div>

            {/* Storage Destination Indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              <HardDrive className="h-3.5 w-3.5 text-sky-400" />
              <span>Save Storage:</span>
              <span className="font-bold text-slate-200 uppercase">
                {storageLocation === "browser_indexeddb"
                  ? "In-App IndexedDB"
                  : storageLocation === "local_filesystem"
                  ? "Local Disk Folder"
                  : "Auto-Download"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: OBS Control Deck (Camera, Scorebug, Replay, Stream Keys) */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/60 p-4 space-y-4 overflow-y-auto">
          {/* Deck Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveControlTab("camera")}
              className={`rounded-lg py-2 text-[0.68rem] font-black uppercase transition-colors cursor-pointer ${
                activeControlTab === "camera"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Camera
            </button>
            <button
              type="button"
              onClick={() => setActiveControlTab("scorebug")}
              className={`rounded-lg py-2 text-[0.68rem] font-black uppercase transition-colors cursor-pointer ${
                activeControlTab === "scorebug"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Overlay
            </button>
            <button
              type="button"
              onClick={() => setActiveControlTab("replays")}
              className={`rounded-lg py-2 text-[0.68rem] font-black uppercase transition-colors cursor-pointer relative ${
                activeControlTab === "replays"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Replays
              {storedVideos.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-400 text-slate-950 px-1 text-[0.55rem] font-black">
                  {storedVideos.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveControlTab("streaming")}
              className={`rounded-lg py-2 text-[0.68rem] font-black uppercase transition-colors cursor-pointer ${
                activeControlTab === "streaming"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Live Set
            </button>
          </div>

          {/* TAB 1: CAMERA & VIDEO INPUT SETTINGS */}
          {activeControlTab === "camera" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-300">
                  Select Video Input Source:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => startCamera(selectedDeviceId)}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-black uppercase transition-all cursor-pointer border ${
                      videoSourceType === "camera" && cameraActive
                        ? "bg-[#0B2F5C] border-blue-400 text-white shadow-md"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                    Webcam / Cam
                  </button>
                  <button
                    type="button"
                    onClick={startScreenShare}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-black uppercase transition-all cursor-pointer border ${
                      videoSourceType === "screen" && cameraActive
                        ? "bg-[#0B2F5C] border-blue-400 text-white shadow-md"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <Tv className="h-4 w-4" />
                    Capture Card / Screen
                  </button>
                </div>
              </div>

              {/* Camera Selector */}
              {videoDevices.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-black uppercase text-slate-400">
                    Detected Camera Devices:
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      startCamera(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs font-bold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={() => startCamera(selectedDeviceId)}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer shadow-md"
                  >
                    Turn On Video Feed
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Turn Off Feed
                  </button>
                )}
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                  <p className="font-bold">Camera Connection Error:</p>
                  <p>{cameraError}</p>
                </div>
              )}

              {/* Storage Choice */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-black uppercase text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                  Recording Storage Destination:
                </label>
                <div className="space-y-1.5">
                  {[
                    {
                      id: "browser_indexeddb",
                      title: "In-App Database (Instant Replay)",
                      desc: "Saved in BoxScore for instant slow motion playback and highlight review.",
                    },
                    {
                      id: "local_filesystem",
                      title: "Choose Folder on Computer",
                      desc: "Directly saves video files to your preferred local hard drive directory.",
                    },
                    {
                      id: "download_prompt",
                      title: "Standard Download Prompt",
                      desc: "Prompts browser to download as file at end of recording.",
                    },
                  ].map((dest) => (
                    <label
                      key={dest.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        storageLocation === dest.id
                          ? "bg-rose-950/30 border-rose-500/60"
                          : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name="storage_destination"
                        value={dest.id}
                        checked={storageLocation === dest.id}
                        onChange={() => setStorageLocation(dest.id as StorageLocation)}
                        className="mt-0.5"
                      />
                      <div className="text-left">
                        <p className="text-xs font-black text-white">{dest.title}</p>
                        <p className="text-[0.68rem] text-slate-400">{dest.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCOREBUG OVERLAY CONTROLS */}
          {activeControlTab === "scorebug" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-300 mb-1.5">
                  Overlay Position:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScorebugPosition("bottom_bar")}
                    className={`p-2.5 rounded-xl text-xs font-black uppercase border cursor-pointer ${
                      scorebugPosition === "bottom_bar"
                        ? "bg-rose-600 border-rose-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Bottom Center Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setScorebugPosition("top_corner")}
                    className={`p-2.5 rounded-xl text-xs font-black uppercase border cursor-pointer ${
                      scorebugPosition === "top_corner"
                        ? "bg-rose-600 border-rose-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Top Left Corner
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-300 mb-1.5">
                  Visual Theme:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScorebugTheme("broadcast_dark")}
                    className={`p-2.5 rounded-xl text-xs font-black uppercase border cursor-pointer ${
                      scorebugTheme === "broadcast_dark"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    ESPN Dark Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => setScorebugTheme("clean_light")}
                    className={`p-2.5 rounded-xl text-xs font-black uppercase border cursor-pointer ${
                      scorebugTheme === "clean_light"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    Clean White
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center justify-between text-xs font-bold text-slate-300 cursor-pointer">
                  <span>Display 24s Shot Clock</span>
                  <input
                    type="checkbox"
                    checked={showShotClock}
                    onChange={(e) => setShowShotClock(e.target.checked)}
                    className="h-4 w-4 rounded accent-rose-600"
                  />
                </label>

                <label className="flex items-center justify-between text-xs font-bold text-slate-300 cursor-pointer">
                  <span>Broadcast Sponsor Tag</span>
                  <input
                    type="checkbox"
                    checked={showSponsorTag}
                    onChange={(e) => setShowSponsorTag(e.target.checked)}
                    className="h-4 w-4 rounded accent-rose-600"
                  />
                </label>
              </div>

              {showSponsorTag && (
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 mb-1">
                    Watermark Text:
                  </label>
                  <input
                    type="text"
                    value={sponsorText}
                    onChange={(e) => setSponsorText(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-xs font-bold text-white focus:outline-none"
                    placeholder="e.g. LIVE ON FACEBOOK"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SAVED VIDEOS & SLOW MOTION REPLAY */}
          {activeControlTab === "replays" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-slate-300">
                  Recorded Game Clips ({storedVideos.length})
                </h3>
                <button
                  type="button"
                  onClick={refreshStoredVideos}
                  className="text-xs text-slate-400 hover:text-white"
                  title="Refresh video list"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {storedVideos.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
                  <Film className="h-8 w-8 mx-auto text-slate-600" />
                  <p className="text-xs font-bold text-slate-400">
                    No Recorded Clips Yet
                  </p>
                  <p className="text-[0.68rem] text-slate-500">
                    Hit &quot;Start Recording Game&quot; to record plays. Recorded videos are saved to your chosen storage and can be replayed in slow motion directly over the live feed!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {storedVideos.map((video) => (
                    <div
                      key={video.id}
                      className="p-3 rounded-2xl border border-slate-800 bg-slate-800/50 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {video.thumbnailDataUrl ? (
                          <img
                            src={video.thumbnailDataUrl}
                            alt={video.title}
                            className="w-20 h-14 rounded-lg object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                            <Film className="h-5 w-5 text-slate-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-white truncate">
                            {video.title}
                          </p>
                          <p className="text-[0.65rem] text-slate-400">
                            Duration: {formatClock(video.durationSeconds)} • {(video.sizeBytes / 1_000_000).toFixed(1)} MB
                          </p>
                          <p className="text-[0.65rem] text-slate-500">
                            {new Date(video.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      {/* Replay Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/60">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePlaySlowMotionReplay(video)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[0.68rem] font-black uppercase cursor-pointer"
                            title="Play Slow-Mo Replay on Live Screen"
                          >
                            <Repeat className="h-3 w-3" />
                            Slow-Mo (0.5x)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handlePlaySlowMotionReplay(video);
                              handleSpeedChange(0.25);
                            }}
                            className="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 text-[0.68rem] font-black cursor-pointer"
                            title="Super Slow 0.25x"
                          >
                            0.25x
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadVideo(video)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
                            title="Download video file"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVideo(video.id)}
                            className="p-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                            title="Delete video"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FACEBOOK LIVE & YOUTUBE LIVE SETUP GUIDE */}
          {activeControlTab === "streaming" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-950/60 to-red-950/60 border border-slate-700 space-y-2">
                <h3 className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                  <Radio className="h-4 w-4 text-rose-500" />
                  Stream to Facebook or YouTube
                </h3>
                <p className="text-[0.68rem] text-slate-300 leading-relaxed">
                  You can stream this exact broadcast canvas with scoreboard, camera, and instant slow-mo replays directly to Facebook Live or YouTube Live!
                </p>
              </div>

              {/* Method 1: Virtual Camera / Direct OBS */}
              <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-2.5">
                <h4 className="text-xs font-black uppercase text-amber-400">
                  Method 1: Direct in OBS Studio (Browser Source)
                </h4>
                <p className="text-[0.68rem] text-slate-300">
                  In OBS Studio, add a <strong>Browser Source</strong> with this page URL or capture this window.
                </p>

                <div className="space-y-1">
                  <label className="text-[0.65rem] font-bold text-slate-400 uppercase">
                    Overlay Browser URL for OBS:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== "undefined" ? `${window.location.origin}/scoreboard?leagueId=${selectedLeagueId}&matchId=${selectedMatchId}` : ""}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[0.68rem] font-mono text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          `${window.location.origin}/scoreboard?leagueId=${selectedLeagueId}&matchId=${selectedMatchId}`,
                          "obs-url"
                        )
                      }
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1 text-[0.68rem] font-black uppercase cursor-pointer"
                    >
                      {copiedKey === "obs-url" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Method 2: Facebook / YouTube RTMP Steps */}
              <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-2.5">
                <h4 className="text-xs font-black uppercase text-sky-400">
                  Method 2: One-Click Browser Live Streaming
                </h4>
                <ol className="text-[0.68rem] text-slate-300 space-y-1.5 list-decimal list-inside">
                  <li>
                    Open <strong>Facebook Live Producer</strong> or <strong>YouTube Live Studio</strong> in another tab.
                  </li>
                  <li>
                    Choose <strong>&quot;Webcam&quot;</strong> or <strong>&quot;Screen Sharing&quot;</strong> as your stream source.
                  </li>
                  <li>
                    Select <strong>This Tab / Window (Box Score Broadcast Studio)</strong>.
                  </li>
                  <li>
                    Click <strong>&quot;Go Live&quot;</strong> on YouTube or Facebook! Your stream will feature full HD camera, live scoreboard, and slow-motion replays.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
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
            Initializing OBS Broadcast Studio...
          </p>
        </div>
      }
    >
      <LiveBroadcastStudioContent />
    </Suspense>
  );
}
