"use client";

import React, { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PwaInstallControl() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(true);
  const [isIosOrSafari, setIsIosOrSafari] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register Service Worker for PWA installability
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("SW registration skipped:", err));
    }

    const checkStandalone = () => {
      const standaloneMatch =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: window-controls-overlay)").matches ||
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsStandalone(standaloneMatch);
    };

    checkStandalone();

    const ua = window.navigator.userAgent || "";
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    setIsIosOrSafari(isAppleMobile || isSafari);

    try {
      if (sessionStorage.getItem("boxscore_pwa_banner_dismissed") === "1") {
        setDismissed(true);
      }
    } catch {}

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsStandalone(false);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowGuideModal(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = (ev: MediaQueryListEvent) => {
      setIsStandalone(ev.matches);
    };
    mediaQuery.addEventListener?.("change", handleMediaChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery.removeEventListener?.("change", handleMediaChange);
    };
  }, []);

  if (isStandalone || dismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
          setIsStandalone(true);
        }
      } catch {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowGuideModal(false);
    try {
      sessionStorage.setItem("boxscore_pwa_banner_dismissed", "1");
    } catch {}
  };

  return (
    <>
      <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-slate-950/95 px-3 py-1.5 text-white shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 text-[0.7rem] font-black uppercase tracking-wider text-sky-300 hover:text-white cursor-pointer"
          title="Install BOX SCORE as a standalone Web App on your device"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[0.65rem] text-slate-950 font-black">
            ⬇
          </span>
          <span>Install Web App</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss Install Web App button"
          className="ml-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-black text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon-192.png"
                  alt="BOX SCORE Icon"
                  className="h-9 w-9 rounded-xl border border-slate-700"
                />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-white">
                    Install BOX SCORE Web App
                  </h3>
                  <p className="text-[0.68rem] text-slate-400">
                    Run full-screen on Desktop, iPhone, iPad, or Android
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-black text-slate-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isIosOrSafari ? (
              <div className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-xs text-slate-200">
                <p className="font-black uppercase text-sky-300">
                  🍎 iPhone / iPad / macOS Safari Instructions:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[0.75rem] text-slate-300">
                  <li>
                    Tap the browser <strong>Share</strong> button{" "}
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-white">
                      [↑]
                    </span>{" "}
                    in the toolbar.
                  </li>
                  <li>
                    Select <strong>&ldquo;Add to Home Screen&rdquo;</strong> (or{" "}
                    <strong>&ldquo;Add to Dock&rdquo;</strong> on Mac).
                  </li>
                  <li>
                    Tap <strong>Add</strong> to launch BOX SCORE as a standalone app.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-slate-200">
                <p className="font-black uppercase text-emerald-300">
                  💻 Chrome / Edge / Android Instructions:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[0.75rem] text-slate-300">
                  <li>
                    Click the <strong>Install App</strong> icon in the right side of your address
                    bar (or open the browser menu <strong>⋮</strong>).
                  </li>
                  <li>
                    Select <strong>&ldquo;Install BOX SCORE...&rdquo;</strong> or{" "}
                    <strong>&ldquo;Add to Home screen&rdquo;</strong>.
                  </li>
                </ol>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-black uppercase text-slate-950 hover:bg-sky-400 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
