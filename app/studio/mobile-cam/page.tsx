"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  RefreshCw,
  Radio,
  Wifi,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Video,
  VideoOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import {
  RTC_CONFIG,
  addIceCandidateSafely,
  flushBufferedIceCandidates,
} from "@/lib/webrtc-config";

function MobileCameraSenderContent() {
  const searchParams = useSearchParams();
  const initialRoom = (searchParams.get("room") || "").trim().toUpperCase();
  const initialName = searchParams.get("name") || "";
  const initialPlatformParam = searchParams.get("platform");

  const [roomCode, setRoomCode] = useState<string>(initialRoom);
  const [camName, setCamName] = useState<string>(initialName || "Mobile Cam");
  const [devicePlatform, setDevicePlatform] = useState<"iphone" | "android">(
    initialPlatformParam === "android" ? "android" : "iphone"
  );
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<
    "idle" | "waiting_studio" | "webrtc_connecting" | "streaming_webrtc" | "streaming_relay"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [framesSent, setFramesSent] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const webrtcConnectedRef = useRef<boolean>(false);
  const isNegotiatingRef = useRef<boolean>(false);
  const currentOfferIdRef = useRef<string>("");
  const appliedAnswerOfferIdRef = useRef<string>("");
  const appliedStudioIceCountRef = useRef<number>(0);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const relayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSendingHttpFrameRef = useRef<boolean>(false);

  // Enumerate phone cameras (Ultra-Wide, Main, Telephoto, Front)
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(list.filter((d) => d.kind === "videoinput"));
    } catch {
      // ignore
    }
  }, []);

  // Start local phone camera with automatic constraint fallback for iOS Safari & Android Chrome
  const startPhoneCamera = useCallback(
    async (
      nextFacing: "environment" | "user" = facingMode,
      nextRes: "720p" | "1080p" = resolution,
      specificDeviceId: string = selectedDeviceId
    ) => {
      setErrorMsg(null);
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const idealW = nextRes === "1080p" ? 1920 : 1280;
        const idealH = nextRes === "1080p" ? 1080 : 720;

        let stream: MediaStream | null = null;
        try {
          const videoConstraints: MediaTrackConstraints = specificDeviceId
            ? {
                deviceId: { exact: specificDeviceId },
                width: { ideal: idealW },
                height: { ideal: idealH },
              }
            : {
                facingMode: { ideal: nextFacing },
                width: { ideal: idealW },
                height: { ideal: idealH },
              };
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Fallback 1: Facing mode only without resolution constraints
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: nextFacing },
              audio: false,
            });
          } catch {
            // Fallback 2: Any available camera on the device
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);
        await refreshDevices();

        // If peer connection already exists, replace the video track seamlessly
        if (pcRef.current) {
          const newTrack = stream.getVideoTracks()[0];
          const sender = pcRef.current
            .getSenders()
            .find((s) => s.track && s.track.kind === "video");
          if (sender && newTrack) {
            await sender.replaceTrack(newTrack).catch(() => {});
          }
        }
      } catch (err) {
        setIsCameraActive(false);
        setErrorMsg(
          err instanceof Error
            ? `Camera Error: ${err.message}. Make sure you opened this page over HTTPS (or localhost) and granted Camera permission.`
            : "Could not access phone camera."
        );
      }
    },
    [facingMode, resolution, selectedDeviceId, refreshDevices]
  );

  // Create WebRTC Offer and send to Studio via BOTH Supabase Realtime & HTTP Signaling Bridge
  const initiateWebRtcOffer = useCallback(
    async (forceRestart: boolean = false) => {
      const stream = streamRef.current;
      const cleanRoom = roomCode.trim().toUpperCase();
      if (!stream || !cleanRoom) return;

      if (!forceRestart) {
        if (isNegotiatingRef.current) return;
        if (
          pcRef.current &&
          (pcRef.current.connectionState === "connected" ||
            pcRef.current.iceConnectionState === "connected" ||
            pcRef.current.iceConnectionState === "completed")
        ) {
          return;
        }
      }

      isNegotiatingRef.current = true;
      const offerId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      currentOfferIdRef.current = offerId;
      appliedAnswerOfferIdRef.current = "";
      appliedStudioIceCountRef.current = 0;

      try {
        if (pcRef.current) {
          try {
            pcRef.current.close();
          } catch {
            // ignore
          }
        }

        pendingIceCandidatesRef.current = [];
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            const candidateJson = ev.candidate.toJSON();
            if (channelRef.current) {
              void channelRef.current.send({
                type: "broadcast",
                event: "webrtc_ice_from_phone",
                payload: {
                  roomCode: cleanRoom,
                  offerId,
                  candidate: candidateJson,
                },
              });
            }
            void fetch("/api/wireless-cam", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "phone_ice",
                roomCode: cleanRoom,
                offerId,
                candidate: candidateJson,
              }),
            }).catch(() => {});
          }
        };

        const handleConnectionChange = () => {
          const state = pc.connectionState;
          const iceState = pc.iceConnectionState;
          if (
            state === "connected" ||
            iceState === "connected" ||
            iceState === "completed"
          ) {
            webrtcConnectedRef.current = true;
            isNegotiatingRef.current = false;
            setConnectionState("streaming_webrtc");
          } else if (
            state === "disconnected" ||
            state === "failed" ||
            state === "closed" ||
            iceState === "failed" ||
            iceState === "disconnected"
          ) {
            webrtcConnectedRef.current = false;
            isNegotiatingRef.current = false;
            setConnectionState("streaming_relay");
          }
        };

        pc.onconnectionstatechange = handleConnectionChange;
        pc.oniceconnectionstatechange = handleConnectionChange;

        setConnectionState((prev) =>
          prev === "streaming_relay" ? "streaming_relay" : "webrtc_connecting"
        );
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        // 1. Send via Supabase Realtime
        if (channelRef.current) {
          void channelRef.current.send({
            type: "broadcast",
            event: "webrtc_offer",
            payload: {
              roomCode: cleanRoom,
              offerId,
              camName,
              devicePlatform,
              sdp: pc.localDescription,
            },
          });
        }

        // 2. Also send via HTTP Signaling Bridge so Studio receives it even if WebSockets are delayed
        void fetch("/api/wireless-cam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "offer",
            roomCode: cleanRoom,
            offerId,
            camName,
            devicePlatform,
            sdp: pc.localDescription,
          }),
        }).catch(() => {});
      } catch (err) {
        console.error("[WebRTC Phone] Failed to initiate offer:", err);
        isNegotiatingRef.current = false;
        setConnectionState("streaming_relay");
      }
    },
    [roomCode, camName, devicePlatform]
  );

  // Connect to Supabase Realtime + HTTP Signaling/Frame Relay whenever roomCode + camera are active
  useEffect(() => {
    const cleanRoom = roomCode.trim().toUpperCase();
    if (!cleanRoom || !isCameraActive) return;

    setConnectionState("waiting_studio");
    webrtcConnectedRef.current = false;
    isNegotiatingRef.current = false;

    const applyRemoteAnswer = async (
      sdp: RTCSessionDescriptionInit,
      answerOfferId?: string
    ) => {
      if (!pcRef.current) return;
      if (
        answerOfferId &&
        appliedAnswerOfferIdRef.current === answerOfferId
      ) {
        return;
      }
      if (pcRef.current.signalingState !== "have-local-offer") {
        return;
      }
      try {
        if (answerOfferId) {
          appliedAnswerOfferIdRef.current = answerOfferId;
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushBufferedIceCandidates(
          pcRef.current,
          pendingIceCandidatesRef.current
        );
        isNegotiatingRef.current = false;
      } catch (err) {
        console.warn("[WebRTC Phone] Remote answer error:", err);
        isNegotiatingRef.current = false;
      }
    };

    const ch = supabase.channel(
      `boxscore-wireless-cam-${cleanRoom}-${Date.now().toString(36)}`,
      {
        config: { broadcast: { self: false } },
      }
    );
    // Also subscribe to the canonical room channel name
    const canonicalCh = supabase.channel(`boxscore-wireless-cam-${cleanRoom}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = canonicalCh;

    canonicalCh
      .on("broadcast", { event: "studio_ready" }, () => {
        if (!webrtcConnectedRef.current) {
          void initiateWebRtcOffer(true);
        }
      })
      .on("broadcast", { event: "webrtc_answer" }, async ({ payload }) => {
        if (payload?.sdp) {
          await applyRemoteAnswer(payload.sdp, payload.offerId);
        }
      })
      .on("broadcast", { event: "webrtc_ice_from_studio" }, async ({ payload }) => {
        if (payload?.candidate) {
          await addIceCandidateSafely(
            pcRef.current,
            payload.candidate,
            pendingIceCandidatesRef.current
          );
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void canonicalCh.send({
            type: "broadcast",
            event: "phone_joined",
            payload: { roomCode: cleanRoom, camName, devicePlatform },
          });
          void initiateWebRtcOffer(true);
        }
      });

    // Immediately notify HTTP bridge & start WebRTC offer
    void fetch("/api/wireless-cam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "phone_join",
        roomCode: cleanRoom,
        camName,
        devicePlatform,
      }),
    }).then(() => {
      void initiateWebRtcOffer(true);
    }).catch(() => {});

    // Poll HTTP signaling state every 800ms while WebRTC P2P is not yet connected
    let lastKnownStudioReadyTs = 0;
    const signalingPollInterval = setInterval(async () => {
      if (webrtcConnectedRef.current) return;
      try {
        const res = await fetch(
          `/api/wireless-cam?room=${encodeURIComponent(cleanRoom)}&role=phone`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          answerSdp?: RTCSessionDescriptionInit | null;
          answerForOfferId?: string | null;
          studioCandidates?: RTCIceCandidateInit[];
          studioReadyTs?: number;
        };
        if (!data.ok) return;

        if (
          data.answerSdp &&
          (!data.answerForOfferId ||
            data.answerForOfferId === currentOfferIdRef.current)
        ) {
          await applyRemoteAnswer(
            data.answerSdp,
            data.answerForOfferId || currentOfferIdRef.current
          );
        }

        if (
          Array.isArray(data.studioCandidates) &&
          data.studioCandidates.length > appliedStudioIceCountRef.current
        ) {
          const newCands = data.studioCandidates.slice(
            appliedStudioIceCountRef.current
          );
          appliedStudioIceCountRef.current = data.studioCandidates.length;
          for (const cand of newCands) {
            await addIceCandidateSafely(
              pcRef.current,
              cand,
              pendingIceCandidatesRef.current
            );
          }
        }

        if (
          data.studioReadyTs &&
          data.studioReadyTs > lastKnownStudioReadyTs &&
          lastKnownStudioReadyTs > 0 &&
          !webrtcConnectedRef.current &&
          !isNegotiatingRef.current
        ) {
          void initiateWebRtcOffer(true);
        }
        if (data.studioReadyTs) {
          lastKnownStudioReadyTs = data.studioReadyTs;
        }
      } catch {
        // ignore network hiccup
      }
    }, 800);

    // Instant Live Frame Relay (starts immediately so Studio sees the phone camera right away,
    // and automatically pauses as soon as direct WebRTC HD P2P is connected!)
    const relayInterval = setInterval(async () => {
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) return;

      // When WebRTC P2P is connected, send ZERO relay frames!
      if (webrtcConnectedRef.current) return;
      if (isSendingHttpFrameRef.current) return;

      if (!relayCanvasRef.current) {
        relayCanvasRef.current = document.createElement("canvas");
      }
      const c = relayCanvasRef.current;
      c.width = 480;
      c.height = 270;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(vid, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.55);
      setConnectionState((prev) =>
        prev === "streaming_webrtc" ? prev : "streaming_relay"
      );
      setFramesSent((n) => n + 1);

      isSendingHttpFrameRef.current = true;
      try {
        await fetch("/api/wireless-cam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "frame",
            roomCode: cleanRoom,
            camName,
            devicePlatform,
            frameDataUrl: dataUrl,
          }),
        });
      } catch {
        // Fallback to Supabase broadcast if fetch failed
        if (channelRef.current) {
          void channelRef.current.send({
            type: "broadcast",
            event: "video_frame",
            payload: {
              roomCode: cleanRoom,
              camName,
              devicePlatform,
              frameDataUrl: dataUrl,
              ts: Date.now(),
            },
          });
        }
      } finally {
        isSendingHttpFrameRef.current = false;
      }
    }, 260);

    return () => {
      clearInterval(signalingPollInterval);
      clearInterval(relayInterval);
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      void supabase.removeChannel(ch);
      void supabase.removeChannel(canonicalCh);
      channelRef.current = null;
    };
  }, [roomCode, camName, devicePlatform, isCameraActive, initiateWebRtcOffer]);

  // Auto-detect phone platform & restore saved roomCode/camName if not passed via URL, then auto-start camera
  useEffect(() => {
    let detectedPlatform: "iphone" | "android" =
      initialPlatformParam === "android" ? "android" : "iphone";
    if (typeof navigator !== "undefined" && !initialPlatformParam) {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("android")) {
        detectedPlatform = "android";
      } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
        detectedPlatform = "iphone";
      }
    }

    let restoredRoom = initialRoom;
    let restoredName = initialName;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("boxscore_mobile_cam_config");
        if (raw) {
          const parsed = JSON.parse(raw) as {
            roomCode?: string;
            camName?: string;
            devicePlatform?: "iphone" | "android";
          };
          if (!restoredRoom && parsed.roomCode) {
            restoredRoom = parsed.roomCode.toUpperCase();
            setRoomCode(restoredRoom);
          }
          if (!restoredName && parsed.camName) {
            restoredName = parsed.camName;
            setCamName(restoredName);
          }
          if (!initialPlatformParam && parsed.devicePlatform) {
            detectedPlatform = parsed.devicePlatform;
          }
        }
      } catch {
        // ignore
      }
    }

    setDevicePlatform(detectedPlatform);
    if (!restoredName) {
      setCamName(detectedPlatform === "android" ? "Android Cam" : "iPhone Cam");
    }

    if (restoredRoom) {
      void startPhoneCamera("environment", "720p", "");
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist mobile cam config locally on phone so user can reconnect anytime
  useEffect(() => {
    if (typeof window === "undefined" || !roomCode.trim()) return;
    try {
      window.localStorage.setItem(
        "boxscore_mobile_cam_config",
        JSON.stringify({
          roomCode: roomCode.trim().toUpperCase(),
          camName,
          devicePlatform,
        })
      );
    } catch {
      // ignore
    }
  }, [roomCode, camName, devicePlatform]);

  const handleFlipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setSelectedDeviceId("");
    void startPhoneCamera(next, resolution, "");
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans select-none">
      {/* Top Mobile Header */}
      <header className="px-4 py-3 bg-[#111726] border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-400">
            <Smartphone className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xs font-black uppercase tracking-wider text-white">
              Box Score Wireless Phone Cam
            </h1>
            <p className="text-[0.65rem] text-slate-400 font-bold">
              iPhone &amp; Android Live Broadcast Camera Transmitter
            </p>
          </div>
        </div>

        <Link
          href="/studio"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-slate-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Studio
        </Link>
      </header>

      {/* Main Camera Viewport & Controls */}
      <main className="flex-1 flex flex-col p-3 sm:p-4 gap-3 max-w-xl mx-auto w-full">
        {/* Status Banner */}
        <div
          className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-2 ${
            connectionState === "streaming_webrtc" ||
            connectionState === "streaming_relay"
              ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-200"
              : isCameraActive
              ? "bg-amber-950/50 border-amber-500/40 text-amber-200"
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {connectionState === "streaming_webrtc" ||
            connectionState === "streaming_relay" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <Wifi className="h-4 w-4 text-amber-400 shrink-0" />
            )}
            <div className="text-xs font-black uppercase tracking-wide">
              {connectionState === "streaming_webrtc"
                ? `🟢 DIRECT P2P LIVE (WebRTC HD • Room ${roomCode})`
                : connectionState === "streaming_relay"
                ? `🟢 LIVE RELAY STREAMING (Room ${roomCode} • ${framesSent} frames)`
                : isCameraActive
                ? `🟡 Connecting to Studio • Room ${roomCode || "..."}`
                : "⚪ Tap 'Start Wireless Camera' below"}
            </div>
          </div>

          {(connectionState === "streaming_webrtc" ||
            connectionState === "streaming_relay" ||
            isCameraActive) && (
            <button
              type="button"
              onClick={() => void initiateWebRtcOffer(true)}
              className="rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 px-2.5 py-1 text-[0.6rem] font-black uppercase text-emerald-200 transition-colors cursor-pointer"
              title="Reconnect direct WebRTC peer-to-peer connection"
            >
              {connectionState === "streaming_webrtc" ? "P2P Active" : "Retry HD P2P"}
            </button>
          )}
        </div>

        {/* Live Video Preview */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border-2 border-slate-800 shadow-xl flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 gap-3">
              <Camera className="h-10 w-10 text-rose-500" />
              <p className="text-sm font-black uppercase text-white">
                Turn Your iPhone or Android into a Live Broadcast Camera
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Enter the Room Code shown in Box Score Studio (or scan the Studio QR code) and tap Start.
              </p>
              <button
                type="button"
                onClick={() => void startPhoneCamera(facingMode, resolution, selectedDeviceId)}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg flex items-center gap-2 cursor-pointer"
              >
                <Video className="h-4 w-4" />
                Start Wireless Camera
              </button>
            </div>
          )}

          {isCameraActive && (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-lg bg-black/75 border border-white/15 px-2.5 py-1 text-[0.65rem] font-black uppercase text-white">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
              <span>{camName}</span>
              <span className="text-emerald-400">• {roomCode}</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-950/80 border border-rose-500/50 p-3 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Room Code & Camera Controls Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#131926] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.62rem] font-black uppercase text-slate-400">
              Wireless Device Type:
            </span>
            <div className="grid grid-cols-2 gap-1.5 w-52">
              <button
                type="button"
                onClick={() => setDevicePlatform("iphone")}
                className={`rounded-lg py-1.5 px-2.5 text-[0.65rem] font-black uppercase border cursor-pointer transition-colors ${
                  devicePlatform === "iphone"
                    ? "bg-sky-600 border-sky-400 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
              >
                🍎 iPhone (iOS)
              </button>
              <button
                type="button"
                onClick={() => setDevicePlatform("android")}
                className={`rounded-lg py-1.5 px-2.5 text-[0.65rem] font-black uppercase border cursor-pointer transition-colors ${
                  devicePlatform === "android"
                    ? "bg-emerald-600 border-emerald-400 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
              >
                🤖 Android
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[0.62rem] font-black uppercase text-slate-400 mb-1">
                Studio Pairing Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. CAM101"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-black uppercase tracking-wider text-amber-300 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[0.62rem] font-black uppercase text-slate-400 mb-1">
                Camera Angle Label
              </label>
              <input
                type="text"
                value={camName}
                onChange={(e) => setCamName(e.target.value)}
                placeholder="Baseline iPhone"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          {/* Camera Flip & Lens Controls */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleFlipCamera}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 py-2.5 px-3 text-xs font-black uppercase text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
              <span>
                Flip ({facingMode === "environment" ? "Back Cam" : "Front Cam"})
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const nextRes = resolution === "720p" ? "1080p" : "720p";
                setResolution(nextRes);
                if (isCameraActive) {
                  void startPhoneCamera(facingMode, nextRes, selectedDeviceId);
                }
              }}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 py-2.5 px-3 text-xs font-black uppercase text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              <span>Quality: {resolution}</span>
            </button>
          </div>

          {videoDevices.length > 1 && (
            <div>
              <label className="block text-[0.62rem] font-black uppercase text-slate-400 mb-1">
                Select Phone Camera Lens (Ultra-Wide / Main / Telephoto)
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  void startPhoneCamera(facingMode, resolution, e.target.value);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200"
              >
                <option value="">Auto ({facingMode === "environment" ? "Rear" : "Front"})</option>
                {videoDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Phone Lens #${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between gap-2">
            {!isCameraActive ? (
              <button
                type="button"
                onClick={() => void startPhoneCamera(facingMode, resolution, selectedDeviceId)}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Video className="h-4 w-4" />
                Start Streaming to Studio
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                  }
                  setIsCameraActive(false);
                  setConnectionState("idle");
                }}
                className="w-full rounded-xl bg-rose-600/80 hover:bg-rose-600 py-2.5 text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <VideoOff className="h-4 w-4" />
                Stop Camera ({framesSent > 0 ? `${framesSent} frames synced` : "Active"})
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MobileCamPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center text-xs font-black uppercase">
          Loading Wireless Phone Camera...
        </div>
      }
    >
      <MobileCameraSenderContent />
    </Suspense>
  );
}
