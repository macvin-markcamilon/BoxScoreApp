"use client";

import React, { useEffect, useRef, useState } from "react";

export default function CleanFeedPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [showHud, setShowHud] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const hideHudTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.title = "BOX SCORE LIVE FEED — Clean 16:9 Broadcast Output";

    const resetHudTimer = () => {
      setShowHud(true);
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
      hideHudTimerRef.current = setTimeout(() => {
        setShowHud(false);
      }, 3000);
    };

    resetHudTimer();
    window.addEventListener("mousemove", resetHudTimer);
    window.addEventListener("keydown", resetHudTimer);

    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);

    // Register canvas on window so opener Studio tab can push directly
    const canvas = canvasRef.current;
    if (canvas) {
      (window as unknown as { __boxScoreCleanTargetCanvas?: HTMLCanvasElement }).__boxScoreCleanTargetCanvas =
        canvas;
    }

    // Also pull from window.opener.__boxScoreLiveCanvas at 60fps (survives tab reload!)
    let rafId = 0;
    let running = true;

    const renderLoop = () => {
      if (!running) return;
      try {
        const openerWin = window.opener as
          | (Window & { __boxScoreLiveCanvas?: HTMLCanvasElement | null })
          | null;
        const srcCanvas = openerWin?.__boxScoreLiveCanvas;
        const dstCanvas = canvasRef.current;
        if (srcCanvas && dstCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
          const ctx = dstCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(srcCanvas, 0, 0, dstCanvas.width, dstCanvas.height);
            setIsConnected(true);
          }
        }
      } catch {
        // Cross-window access not available; rely on BroadcastChannel fallback below
      }
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);

    // Fallback BroadcastChannel listener if user opened /studio/clean-feed manually in another tab
    let bc: BroadcastChannel | null = null;
    const fallbackImg = new Image();
    fallbackImg.onload = () => {
      const dstCanvas = canvasRef.current;
      if (!dstCanvas) return;
      const ctx = dstCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(fallbackImg, 0, 0, dstCanvas.width, dstCanvas.height);
        setIsConnected(true);
      }
    };

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        bc = new BroadcastChannel("boxscore_clean_feed_channel");
        bc.onmessage = (ev) => {
          if (ev.data?.type === "CLEAN_FEED_FRAME" && typeof ev.data.dataUrl === "string") {
            const openerWin = window.opener as
              | (Window & { __boxScoreLiveCanvas?: HTMLCanvasElement | null })
              | null;
            if (!openerWin?.__boxScoreLiveCanvas) {
              fallbackImg.src = ev.data.dataUrl;
            }
          }
        };
        bc.postMessage({ type: "CLEAN_FEED_SUBSCRIBED" });
      } catch {}
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", resetHudTimer);
      window.removeEventListener("keydown", resetHudTimer);
      document.removeEventListener("fullscreenchange", onFsChange);
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black w-screen h-screen overflow-hidden flex items-center justify-center select-none">
      <canvas
        id="cleanProgCanvas"
        ref={canvasRef}
        width={1920}
        height={1080}
        className="w-full h-full object-contain block bg-black"
      />

      {!isConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-white p-6 text-center space-y-2">
          <div className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
          <p className="text-sm font-black uppercase tracking-wider">
            Waiting for Box Score Studio Live Program Feed...
          </p>
          <p className="text-xs text-slate-400 max-w-md">
            Keep your main <strong>/studio</strong> tab open. This tab mirrors your Live Program output (cameras, scorebug, transitions &amp; replays) in clean 16:9 HD.
          </p>
        </div>
      )}

      {showHud && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 rounded-xl bg-slate-950/80 border border-slate-700/80 px-3 py-1.5 backdrop-blur-md transition-opacity">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-200">
            Clean 16:9 Live Feed Tab
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-[0.65rem] font-black uppercase text-white cursor-pointer"
          >
            {isFullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}
          </button>
        </div>
      )}
    </div>
  );
}
