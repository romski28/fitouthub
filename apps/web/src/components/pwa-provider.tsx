"use client";

import { useEffect, useState, useCallback } from "react";

const SW_PATH = "/sw.js";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

// ── Types ────────────────────────────────────────────────────────
interface PwaState {
  swSupported: boolean;
  swRegistered: boolean;
  pushSupported: boolean;
  pushSubscribed: boolean;
  canInstall: boolean;
  isStandalone: boolean;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

// ── URL-safe base64 ──────────────────────────────────────────────
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64url);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output as Uint8Array<ArrayBuffer>;
}

// ── Hook ─────────────────────────────────────────────────────────
export function usePwa(): PwaState & {
  subscribeToPush: () => Promise<PushSubscription | null>;
  unsubscribeFromPush: () => Promise<boolean>;
  promptInstall: () => Promise<boolean>;
} {
  const [state, setState] = useState<PwaState>({
    swSupported: false,
    swRegistered: false,
    pushSupported: false,
    pushSubscribed: false,
    canInstall: false,
    isStandalone: false,
  });

  // Capture beforeinstallprompt
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check basic support
    const swSupported = "serviceWorker" in navigator;
    const pushSupported = swSupported && "PushManager" in window;
    setState((s) => ({ ...s, swSupported, pushSupported, isStandalone: isStandalone() }));

    // Listen for install prompt (Chrome/Edge on Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setState((s) => ({ ...s, canInstall: true }));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Detect when app is installed
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setState((s) => ({ ...s, canInstall: false, isStandalone: true }));
      console.log("[PWA] App installed successfully");
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // Register service worker
    if (swSupported) {
      navigator.serviceWorker
        .register(SW_PATH)
        .then(async (registration) => {
          console.log("[PWA] SW registered:", registration.scope);
          setState((s) => ({ ...s, swRegistered: true }));

          // Check existing push subscription
          if (pushSupported) {
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
              setState((s) => ({ ...s, pushSubscribed: true }));
            }
          }

          // Listen for SW updates
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log("[PWA] New version available — refresh to update");
                // Could show a toast: "New version available!"
              }
            });
          });
        })
        .catch((err) => {
          console.warn("[PWA] SW registration failed:", err);
        });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // ── Subscribe to push ──────────────────────────────────────────
  const subscribeToPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.swRegistered) return null;

    try {
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (sub) return sub; // already subscribed

      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
          ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          : undefined,
      });

      setState((s) => ({ ...s, pushSubscribed: true }));
      console.log("[PWA] Push subscribed:", sub.endpoint);
      return sub;
    } catch (err) {
      console.warn("[PWA] Push subscription failed:", err);
      return null;
    }
  }, [state.swRegistered]);

  // ── Unsubscribe from push ───────────────────────────────────────
  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!state.swRegistered) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) return true;
      await sub.unsubscribe();
      setState((s) => ({ ...s, pushSubscribed: false }));
      console.log("[PWA] Push unsubscribed");
      return true;
    } catch {
      return false;
    }
  }, [state.swRegistered]);

  // ── Prompt install ─────────────────────────────────────────────
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!installPrompt) return false;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      console.log("[PWA] Install prompt:", result.outcome);
      setInstallPrompt(null);
      setState((s) => ({ ...s, canInstall: false }));
      return result.outcome === "accepted";
    } catch {
      return false;
    }
  }, [installPrompt]);

  return { ...state, subscribeToPush, unsubscribeFromPush, promptInstall };
}

// ── PWA Provider Component ───────────────────────────────────────
export function PwaProvider() {
  const { canInstall, isStandalone, promptInstall, swRegistered } = usePwa();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Hide if already in standalone mode, not installable, or dismissed
  if (isStandalone || !canInstall || dismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    const accepted = await promptInstall();
    if (!accepted) {
      setInstalling(false);
      // Don't dismiss — user may want to install later
    }
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[9999] mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] p-4 shadow-lg">
        <img
          src="/assets/images/favicon-180.png"
          alt="Mimo"
          className="h-10 w-10 rounded-lg"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Install Mimo App</p>
          <p className="text-xs text-slate-600">
            Add to home screen for quick access {swRegistered ? "and push notifications" : ""}
          </p>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {installing ? "..." : "Install"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-slate-400 hover:text-slate-600"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Inline service worker registration (no React needed) ────────
// This runs once at script level to register early
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Service worker registration is now handled inside the usePwa hook.
  // This block is intentionally empty — keep for future early-registration.
}

// ── BeforeInstallPromptEvent type ────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
