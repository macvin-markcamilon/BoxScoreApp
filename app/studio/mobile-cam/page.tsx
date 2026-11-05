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
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
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

  // Camera Zoom & Maximize / Fullscreen State
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hardwareZoomSupported, setHardwareZoomSupported] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Studio Tally State (shows if this camera is ON AIR or IN PREVIEW based on Studio selection)
  const [isOnAir, setIsOnAir] = useState<boolean>(false);
  const [isInPreview, setIsInPreview] = useState<boolean>(false);
  const [studioLiveSceneName, setStudioLiveSceneName] = useState<string>("Main Court");
  const [studioPreviewSceneName, setStudioPreviewSceneName] = useState<string>("Preview");

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<
    "idle" | "waiting_studio" | "webrtc_connecting" | "streaming_webrtc" | "streaming_relay"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [framesSent, setFramesSent] = useState<number>(0);

  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hubChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const webrtcConnectedRef = useRef<boolean>(false);
  const isNegotiatingRef = useRef<boolean>(false);
  const lastOfferSentAtRef = useRef<number>(0);
  const currentOfferIdRef = useRef<string>("");
  const appliedAnswerOfferIdRef = useRef<string>("");
  const appliedStudioIceCountRef = useRef<number>(0);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const relayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSendingHttpFrameRef = useRef<boolean>(false);
  const zoomLevelRef = useRef<number>(1);
  const hardwareZoomSupportedRef = useRef<boolean>(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // Apply Camera Zoom (Hardware Optical/Sensor Zoom if supported + Broadcast Zoom Metadata to Studio)
  const applyCameraZoom = useCallback(
    async (targetZoom: number) => {
      const clamped = Number(Math.min(5, Math.max(1, targetZoom)).toFixed(2));
      setZoomLevel(clamped);
      zoomLevelRef.current = clamped;

      let appliedHw = false;
      const stream = streamRef.current;
      const videoTrack = stream?.getVideoTracks()?.[0];
      if (videoTrack && typeof videoTrack.getCapabilities === "function") {
        try {
          const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            zoom?: { min?: number; max?: number; step?: number };
          };
          if (caps?.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1) {
            const hwMin = caps.zoom.min ?? 1;
            const hwMax = caps.zoom.max;
            const hwTarget = Math.min(hwMax, Math.max(hwMin, clamped));
            await videoTrack.applyConstraints({
              advanced: [{ zoom: hwTarget } as MediaTrackConstraintSet],
            });
            appliedHw = true;
          }
        } catch {
          appliedHw = false;
        }
      }
      setHardwareZoomSupported(appliedHw);
      hardwareZoomSupportedRef.current = appliedHw;

      const cleanRoom = roomCode.trim().toUpperCase();
      if (!cleanRoom) return;

      // Broadcast zoom metadata so Studio also crops WebRTC stream if hardware zoom wasn't applied on the track
      const effectiveDigitalZoom = appliedHw ? 1 : clamped;
      const payload = {
        roomCode: cleanRoom,
        zoomLevel: effectiveDigitalZoom,
        displayZoom: clamped,
      };
      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "camera_zoom",
          payload,
        });
      }
      if (hubChannelRef.current) {
        void hubChannelRef.current.send({
          type: "broadcast",
          event: "camera_zoom",
          payload,
        });
      }
      void fetch("/api/wireless-cam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "zoom",
          roomCode: cleanRoom,
          zoomLevel: effectiveDigitalZoom,
        }),
      }).catch(() => {});
    },
    [roomCode]
  );

  // Toggle Maximize / Fullscreen Mode (works on both iPhone iOS Safari and Android Chrome)
  const toggleMaximize = useCallback(async () => {
    const nextMax = !isMaximized;
    setIsMaximized(nextMax);
    try {
      if (nextMax && viewportContainerRef.current) {
        const el = viewportContainerRef.current as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (typeof el.requestFullscreen === "function") {
          await el.requestFullscreen().catch(() => {});
        } else if (typeof el.webkitRequestFullscreen === "function") {
          await el.webkitRequestFullscreen();
        }
      } else if (!nextMax && typeof document !== "undefined" && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Fallback CSS fixed inset-0 handles iOS Safari where requestFullscreen isn't supported on divs
    }
  }, [isMaximized]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFsChange = () => {
      if (!document.fullscreenElement && isMaximized) {
        // Keep CSS maximize active unless user tapped Minimize, or sync if exited via hardware back button
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [isMaximized]);

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
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: nextFacing },
              audio: false,
            });
          } catch {
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

        // Check hardware zoom capability on the new track
        const vTrack = stream.getVideoTracks()[0];
        if (vTrack && typeof vTrack.getCapabilities === "function") {
          try {
            const caps = vTrack.getCapabilities() as MediaTrackCapabilities & {
              zoom?: { min?: number; max?: number };
            };
            const hasHwZoom = Boolean(
              caps?.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1
            );
            setHardwareZoomSupported(hasHwZoom);
            hardwareZoomSupportedRef.current = hasHwZoom;
            if (hasHwZoom && zoomLevelRef.current > 1) {
              await vTrack.applyConstraints({
                advanced: [{ zoom: zoomLevelRef.current } as MediaTrackConstraintSet],
              });
            }
          } catch {
            setHardwareZoomSupported(false);
            hardwareZoomSupportedRef.current = false;
          }
        }

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

  // Create WebRTC Offer and send to Studio via BOTH Supabase Realtime (Room + Hub) & HTTP Signaling Bridge
  const initiateWebRtcOffer = useCallback(
    async (forceRestart: boolean = false) => {
      const stream = streamRef.current;
      const cleanRoom = roomCode.trim().toUpperCase();
      if (!stream || !cleanRoom) return;

      const now = Date.now();
      if (!forceRestart) {
        if (isNegotiatingRef.current && now - lastOfferSentAtRef.current < 4000) {
          return;
        }
        if (
          pcRef.current &&
          (pcRef.current.connectionState === "connected" ||
            pcRef.current.iceConnectionState === "connected" ||
            pcRef.current.iceConnectionState === "completed")
        ) {
          return;
        }
      } else if (isNegotiatingRef.current && now - lastOfferSentAtRef.current < 1500) {
        // Prevent duplicate simultaneous forceRestart calls from clobbering an offer in flight
        return;
      }

      isNegotiatingRef.current = true;
      lastOfferSentAtRef.current = now;
      const offerId = `offer-${now}-${Math.random().toString(36).slice(2, 6)}`;
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
            const icePayload = {
              roomCode: cleanRoom,
              offerId,
              candidate: candidateJson,
            };
            if (channelRef.current) {
              void channelRef.current.send({
                type: "broadcast",
                event: "webrtc_ice_from_phone",
                payload: icePayload,
              });
            }
            if (hubChannelRef.current) {
              void hubChannelRef.current.send({
                type: "broadcast",
                event: "webrtc_ice_from_phone",
                payload: icePayload,
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

        const offerPayload = {
          roomCode: cleanRoom,
          offerId,
          camName,
          devicePlatform,
          zoomLevel: hardwareZoomSupportedRef.current ? 1 : zoomLevelRef.current,
          sdp: pc.localDescription,
        };

        // 1. Send via Room Channel & Global Hub Channel on Supabase Realtime
        if (channelRef.current) {
          void channelRef.current.send({
            type: "broadcast",
            event: "webrtc_offer",
            payload: offerPayload,
          });
        }
        if (hubChannelRef.current) {
          void hubChannelRef.current.send({
            type: "broadcast",
            event: "webrtc_offer",
            payload: offerPayload,
          });
        }

        // 2. Also send via HTTP Signaling Bridge
        void fetch("/api/wireless-cam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "offer",
            ...offerPayload,
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

  // Connect to Supabase Realtime (Room + Global Hub) + HTTP Signaling/Frame Relay whenever roomCode + camera are active
  useEffect(() => {
    const cleanRoom = roomCode.trim().toUpperCase();
    if (!cleanRoom || !isCameraActive) return;

    setConnectionState("waiting_studio");
    webrtcConnectedRef.current = false;
    isNegotiatingRef.current = false;

    const applyTallyUpdate = (payload?: {
      onAirRoomCodes?: string[];
      previewRoomCodes?: string[];
      liveSceneName?: string;
      previewSceneName?: string;
      isOnAir?: boolean;
      isInPreview?: boolean;
    }) => {
      if (!payload) return;
      if (payload.liveSceneName) setStudioLiveSceneName(payload.liveSceneName);
      if (payload.previewSceneName) setStudioPreviewSceneName(payload.previewSceneName);
      if (Array.isArray(payload.onAirRoomCodes)) {
        const upperList = payload.onAirRoomCodes.map((r) => r.trim().toUpperCase());
        setIsOnAir(upperList.includes(cleanRoom));
      } else if (typeof payload.isOnAir === "boolean") {
        setIsOnAir(payload.isOnAir);
      }
      if (Array.isArray(payload.previewRoomCodes)) {
        const upperPrev = payload.previewRoomCodes.map((r) => r.trim().toUpperCase());
        setIsInPreview(upperPrev.includes(cleanRoom));
      } else if (typeof payload.isInPreview === "boolean") {
        setIsInPreview(payload.isInPreview);
      }
    };

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

    // 1. Canonical Room Channel
    const canonicalCh = supabase.channel(`boxscore-wireless-cam-${cleanRoom}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = canonicalCh;

    // 2. Shared Studio Discovery & Tally Hub Channel
    const hubCh = supabase.channel("boxscore-wireless-cam-hub", {
      config: { broadcast: { self: false } },
    });
    hubChannelRef.current = hubCh;

    const attachChannelListeners = (chInstance: ReturnType<typeof supabase.channel>) => {
      chInstance
        .on("broadcast", { event: "studio_ready" }, ({ payload }) => {
          applyTallyUpdate(payload);
          if (
            !payload?.roomCode ||
            String(payload.roomCode).trim().toUpperCase() === cleanRoom
          ) {
            if (!webrtcConnectedRef.current) {
              void initiateWebRtcOffer(true);
            }
          }
        })
        .on("broadcast", { event: "studio_tally_state" }, ({ payload }) => {
          applyTallyUpdate(payload);
        })
        .on("broadcast", { event: "webrtc_answer" }, async ({ payload }) => {
          if (
            payload?.roomCode &&
            String(payload.roomCode).trim().toUpperCase() !== cleanRoom
          ) {
            return;
          }
          if (payload?.sdp) {
            await applyRemoteAnswer(payload.sdp, payload.offerId);
          }
        })
        .on("broadcast", { event: "webrtc_ice_from_studio" }, async ({ payload }) => {
          if (
            payload?.roomCode &&
            String(payload.roomCode).trim().toUpperCase() !== cleanRoom
          ) {
            return;
          }
          if (payload?.candidate) {
            await addIceCandidateSafely(
              pcRef.current,
              payload.candidate,
              pendingIceCandidatesRef.current
            );
          }
        });
    };

    attachChannelListeners(canonicalCh);
    attachChannelListeners(hubCh);

    canonicalCh.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void canonicalCh.send({
          type: "broadcast",
          event: "phone_joined",
          payload: {
            roomCode: cleanRoom,
            camName,
            devicePlatform,
            zoomLevel: hardwareZoomSupportedRef.current ? 1 : zoomLevelRef.current,
          },
        });
        void initiateWebRtcOffer(true);
      }
    });

    hubCh.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void hubCh.send({
          type: "broadcast",
          event: "phone_joined",
          payload: {
            roomCode: cleanRoom,
            camName,
            devicePlatform,
            zoomLevel: hardwareZoomSupportedRef.current ? 1 : zoomLevelRef.current,
          },
        });
      }
    });

    // Notify HTTP bridge as well
    void fetch("/api/wireless-cam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "phone_join",
        roomCode: cleanRoom,
        camName,
        devicePlatform,
        zoomLevel: hardwareZoomSupportedRef.current ? 1 : zoomLevelRef.current,
      }),
    }).catch(() => {});

    // Poll HTTP signaling & tally state every 900ms
    let lastKnownStudioReadyTs = 0;
    const signalingPollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/wireless-cam?room=${encodeURIComponent(cleanRoom)}&role=phone`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          answerSdp?: RTCSessionDescriptionInit | null;
          answerForOfferId?: string | null;
          studioCandidates?: RTCIceCandidateInit[];
          studioReadyTs?: number;
          isOnAir?: boolean;
          isInPreview?: boolean;
          liveSceneName?: string;
          previewSceneName?: string;
          onAirRoomCodes?: string[];
          previewRoomCodes?: string[];
        };
        if (!data.ok) return;

        applyTallyUpdate(data);

        if (webrtcConnectedRef.current) return;

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
    }, 900);

    // Instant Live Frame Relay: ALWAYS sends over BOTH Supabase Realtime AND HTTP Bridge
    // so Studio receives live camera video immediately even across Vercel Serverless instances!
    const relayInterval = setInterval(async () => {
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) return;

      // When WebRTC P2P is connected, we don't need to send relay frames
      if (webrtcConnectedRef.current) return;

      if (!relayCanvasRef.current) {
        relayCanvasRef.current = document.createElement("canvas");
      }
      const c = relayCanvasRef.current;
      c.width = 480;
      c.height = 270;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      // Apply center digital zoom crop if hardware zoom is not active
      const currentZoom = hardwareZoomSupportedRef.current
        ? 1
        : Math.max(1, zoomLevelRef.current);
      const vw = vid.videoWidth || 1280;
      const vh = vid.videoHeight || 720;
      const cropW = vw / currentZoom;
      const cropH = vh / currentZoom;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      ctx.drawImage(vid, cropX, cropY, cropW, cropH, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.52);

      setConnectionState((prev) =>
        prev === "streaming_webrtc" ? prev : "streaming_relay"
      );
      setFramesSent((n) => n + 1);

      const framePayload = {
        roomCode: cleanRoom,
        camName,
        devicePlatform,
        zoomLevel: currentZoom,
        frameDataUrl: dataUrl,
        ts: Date.now(),
      };

      // 1. ALWAYS broadcast over Supabase Realtime (works across all Vercel serverless instances!)
      if (channelRef.current) {
        void channelRef.current.send({
          type: "broadcast",
          event: "video_frame",
          payload: framePayload,
        });
      }
      if (hubChannelRef.current) {
        void hubChannelRef.current.send({
          type: "broadcast",
          event: "video_frame",
          payload: framePayload,
        });
      }

      // 2. Also send to HTTP endpoint in parallel without blocking Supabase
      if (!isSendingHttpFrameRef.current) {
        isSendingHttpFrameRef.current = true;
        fetch("/api/wireless-cam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "frame",
            roomCode: cleanRoom,
            camName,
            devicePlatform,
            zoomLevel: currentZoom,
            frameDataUrl: dataUrl,
          }),
        })
          .then(async (r) => {
            if (r.ok) {
              const j = (await r.json()) as {
                isOnAir?: boolean;
                isInPreview?: boolean;
                liveSceneName?: string;
                previewSceneName?: string;
                onAirRoomCodes?: string[];
                previewRoomCodes?: string[];
              };
              applyTallyUpdate(j);
            }
          })
          .catch(() => {})
          .finally(() => {
            isSendingHttpFrameRef.current = false;
          });
      }
    }, 280);

    return () => {
      clearInterval(signalingPollInterval);
      clearInterval(relayInterval);
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      void supabase.removeChannel(canonicalCh);
      void supabase.removeChannel(hubCh);
      channelRef.current = null;
      hubChannelRef.current = null;
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

  // Two-finger Pinch-to-Zoom touch handlers on the video viewfinder
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoomLevelRef.current;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / Math.max(20, pinchStartDistRef.current);
      const nextZ = Math.min(5, Math.max(1, pinchStartZoomRef.current * ratio));
      void applyCameraZoom(nextZ);
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  const zoomPresets = [1, 1.5, 2, 3, 5];

  return (
    <div
      className="min-h-dvh bg-[#090d16] text-slate-100 flex flex-col font-sans select-none"
      style={{ colorScheme: "dark", accentColor: "#f59e0b" }}
    >
      {/* Top Mobile Header (Hidden when Maximized Fullscreen) */}
      {!isMaximized && (
        <header className="px-4 py-2.5 bg-[#111726] border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-400">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-xs font-black uppercase tracking-wider text-white">
                Box Score Wireless Phone Cam
              </h1>
              <p className="text-[0.62rem] text-slate-400 font-bold">
                iPhone &amp; Android Live Broadcast Camera Transmitter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void toggleMaximize()}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-slate-950 shadow cursor-pointer"
              title="Maximize Camera Viewfinder Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Maximize</span>
            </button>
            <Link
              href="/studio"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-slate-300"
            >
              <ArrowLeft className="h-3 w-3" />
              Studio
            </Link>
          </div>
        </header>
      )}

      {/* Main Camera Viewport & Controls */}
      <main className="flex-1 flex flex-col p-3 sm:p-4 gap-3 max-w-xl mx-auto w-full">
        {/* LIVE STUDIO ON-AIR / PREVIEW TALLY BANNER */}
        {!isMaximized && (
          <div
            className={`rounded-xl px-3.5 py-2.5 border-2 flex items-center justify-between gap-2 transition-all ${
              isOnAir
                ? "bg-rose-950/90 border-rose-500 text-white shadow-[0_0_25px_rgba(244,63,94,0.45)]"
                : isInPreview
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-100"
                  : "bg-slate-900/90 border-slate-800 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {isOnAir ? (
                <span className="flex h-3.5 w-3.5 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500" />
                </span>
              ) : isInPreview ? (
                <span className="h-3 w-3 rounded-full bg-emerald-400 shrink-0" />
              ) : (
                <span className="h-3 w-3 rounded-full bg-slate-500 shrink-0" />
              )}
              <div className="truncate">
                <div className="text-xs font-black uppercase tracking-wider">
                  {isOnAir
                    ? `🔴 ON AIR — LIVE BROADCAST (${studioLiveSceneName})`
                    : isInPreview
                      ? `🟢 CUED IN PREVIEW (${studioPreviewSceneName})`
                      : `⚪ STANDBY • OFF AIR (Live: ${studioLiveSceneName})`}
                </div>
                <div className="text-[0.62rem] font-bold text-slate-300 truncate">
                  {connectionState === "streaming_webrtc"
                    ? `Direct WebRTC HD Connected • Room ${roomCode}`
                    : connectionState === "streaming_relay"
                      ? `Live Cloud Stream Active (${framesSent} frames) • Room ${roomCode}`
                      : isCameraActive
                        ? `Connecting to Studio • Room ${roomCode || "..."}`
                        : "Tap Start Wireless Camera below"}
                </div>
              </div>
            </div>

            {isCameraActive && (
              <button
                type="button"
                onClick={() => void initiateWebRtcOffer(true)}
                className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-1 text-[0.6rem] font-black uppercase text-white cursor-pointer"
              >
                {connectionState === "streaming_webrtc" ? "HD Linked" : "Sync P2P"}
              </button>
            )}
          </div>
        )}

        {/* =================================================================
            CAMERA VIEWPORT (Supports Normal Card & Fullscreen Maximized HUD)
           ================================================================= */}
        <div
          ref={viewportContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={
            isMaximized
              ? `fixed inset-0 z-50 w-dvw h-dvh bg-black overflow-hidden flex items-center justify-center ${
                  isOnAir
                    ? "ring-8 ring-inset ring-rose-600"
                    : isInPreview
                      ? "ring-4 ring-inset ring-emerald-500"
                      : ""
                }`
              : `relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xl flex items-center justify-center transition-all ${
                  isOnAir
                    ? "border-4 border-rose-500 ring-4 ring-rose-500/30"
                    : isInPreview
                      ? "border-3 border-emerald-500"
                      : "border-2 border-slate-800"
                }`
          }
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              transform: hardwareZoomSupported ? "none" : `scale(${zoomLevel})`,
              transformOrigin: "center center",
            }}
            className="w-full h-full object-cover transition-transform duration-100"
          />

          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 gap-3 z-20">
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

          {/* TOP OVERLAY BAR INSIDE VIEWPORT: ON-AIR TALLY BADGE + ROOM CODE + MAXIMIZE/MINIMIZE */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 z-10 pointer-events-none">
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              {/* Live Tally Pill */}
              <div
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider shadow-lg border ${
                  isOnAir
                    ? "bg-rose-600 border-rose-300 text-white animate-pulse"
                    : isInPreview
                      ? "bg-emerald-600/95 border-emerald-300 text-white"
                      : "bg-black/80 border-white/20 text-slate-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isOnAir
                      ? "bg-white animate-ping"
                      : isInPreview
                        ? "bg-emerald-200"
                        : "bg-amber-400"
                  }`}
                />
                <span>
                  {isOnAir
                    ? `ON AIR • ${studioLiveSceneName}`
                    : isInPreview
                      ? `PREVIEW • ${studioPreviewSceneName}`
                      : "STANDBY"}
                </span>
              </div>

              {/* Camera Name & Room Code Pill */}
              <div className="rounded-lg bg-black/75 border border-white/15 px-2.5 py-1 text-[0.65rem] font-black uppercase text-white">
                <span>{camName}</span>
                <span className="text-amber-400 ml-1">• {roomCode || "NO ROOM"}</span>
                <span className="text-sky-300 ml-1.5">{zoomLevel.toFixed(1)}x</span>
              </div>
            </div>

            {/* Right Controls inside Viewport: Flip Camera & Maximize / Minimize */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {isMaximized && (
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="rounded-lg bg-black/80 hover:bg-slate-900 border border-white/25 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-white flex items-center gap-1 cursor-pointer shadow-lg"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                  <span>Flip</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void toggleMaximize()}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 border border-amber-300 px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-slate-950 flex items-center gap-1 cursor-pointer shadow-lg"
                title={isMaximized ? "Exit Fullscreen" : "Maximize Camera Viewfinder"}
              >
                {isMaximized ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Minimize</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Maximize</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* BOTTOM OVERLAY INSIDE VIEWPORT: QUICK ZOOM PRESET PILLS + SLIDER IN MAXIMIZED MODE */}
          {isCameraActive && (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col gap-1.5 z-10 pointer-events-none">
              <div className="flex items-center justify-center gap-1.5 pointer-events-auto">
                {zoomPresets.map((preset) => {
                  const isActiveZoom = Math.abs(zoomLevel - preset) < 0.08;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => void applyCameraZoom(preset)}
                      className={`rounded-full px-3 py-1 text-[0.68rem] font-black transition-all cursor-pointer border shadow ${
                        isActiveZoom
                          ? "bg-amber-400 border-amber-200 text-slate-950 scale-105"
                          : "bg-black/75 border-white/20 text-white hover:bg-black/90"
                      }`}
                    >
                      {preset}x
                    </button>
                  );
                })}
              </div>

              {isMaximized && (
                <div className="mx-auto w-full max-w-md rounded-xl bg-black/80 border border-white/15 px-3 py-2 flex items-center gap-2.5 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => void applyCameraZoom(zoomLevel - 0.25)}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 p-1.5 text-white cursor-pointer"
                    aria-label="Zoom Out"
                  >
                    <ZoomOut className="h-4 w-4 text-amber-400" />
                  </button>
                  <input
                    type="range"
                    aria-label="Camera Zoom Level"
                    min={1}
                    max={5}
                    step={0.1}
                    value={zoomLevel}
                    onChange={(e) => void applyCameraZoom(Number(e.target.value))}
                    className="flex-1 accent-amber-400 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => void applyCameraZoom(zoomLevel + 0.25)}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 p-1.5 text-white cursor-pointer"
                    aria-label="Zoom In"
                  >
                    <ZoomIn className="h-4 w-4 text-amber-400" />
                  </button>
                  <span className="text-xs font-mono font-black text-amber-300 min-w-[42px] text-right">
                    {zoomLevel.toFixed(1)}x
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =================================================================
            DEDICATED ZOOM & CAMERA CONTROLS CARD (BELOW VIEWPORT)
           ================================================================= */}
        {!isMaximized && (
          <>
            {/* Camera Zoom Control Strip */}
            <div className="rounded-2xl border border-slate-800 bg-[#131926] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ZoomIn className="h-3.5 w-3.5" />
                  <span>Camera Zoom Control (Pinch Video or Slide)</span>
                </span>
                <span className="rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-xs font-mono font-black text-amber-300">
                  {zoomLevel.toFixed(1)}x {hardwareZoomSupported ? "(Optical/HW)" : "(Digital HD)"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void applyCameraZoom(zoomLevel - 0.25)}
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 p-2 text-white cursor-pointer"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4 text-amber-400" />
                </button>
                <input
                  type="range"
                  aria-label="Camera Zoom Slider"
                  min={1}
                  max={5}
                  step={0.1}
                  value={zoomLevel}
                  onChange={(e) => void applyCameraZoom(Number(e.target.value))}
                  className="flex-1 accent-amber-400 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => void applyCameraZoom(zoomLevel + 0.25)}
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 p-2 text-white cursor-pointer"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="h-4 w-4 text-amber-400" />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {zoomPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => void applyCameraZoom(preset)}
                    className={`rounded-lg py-1.5 text-xs font-black uppercase border cursor-pointer transition-colors ${
                      Math.abs(zoomLevel - preset) < 0.08
                        ? "bg-amber-400 border-amber-300 text-slate-950"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
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
                    placeholder="e.g. CAM458"
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

              {/* Camera Flip, Maximize & Quality Controls */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 py-2.5 px-2 text-xs font-black uppercase text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                  <span>
                    {facingMode === "environment" ? "Back Cam" : "Front Cam"}
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
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 py-2.5 px-2 text-xs font-black uppercase text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Radio className="h-3.5 w-3.5 text-amber-400" />
                  <span>{resolution}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void toggleMaximize()}
                  className="rounded-xl border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 py-2.5 px-2 text-xs font-black uppercase text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Maximize</span>
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
          </>
        )}
      </main>
    </div>
  );
}

export default function MobileCamPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#090d16] text-white flex items-center justify-center text-xs font-black uppercase">
          Loading Wireless Phone Camera...
        </div>
      }
    >
      <MobileCameraSenderContent />
    </Suspense>
  );
}
