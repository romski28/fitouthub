"use client";

import { useEffect, useState, useCallback } from "react";

const SW_PATH = "/sw.js";
const DISMISS_KEY = "mimo-pwa-banner-dismissed";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

// ── Detect platform ─────────────────────────────────────────────
function getPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  } catch {
    return false;
  }
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
export function usePwa() {
  const [swRegistered, setSwRegistered] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform] = useState(getPlatform);
  const [inStandalone] = useState(isStandalone);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      console.log("[PWA] Service workers not supported");
      return;
    }

    // Register service worker
    navigator.serviceWorker
      .register(SW_PATH, { scope: "/" })
      .then(async (registration) => {
        console.log("[PWA] SW registered OK, scope:", registration.scope);
        setSwRegistered(true);

        // Check existing push subscription
        if ("PushManager" in window) {
          try {
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
              setPushSubscribed(true);
              console.log("[PWA] Existing push subscription found");
            }
          } catch {
            // push not available or denied
          }
        }

        // Listen for SW updates
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              console.log("[PWA] New version available — will update on next load");
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] SW registration failed:", err.message);
      });

    // Capture Chrome install prompt
    const handleBeforeInstall = (e: Event) => {
      console.log("[PWA] beforeinstallprompt fired — native install available");
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Listen for install completion
    const handleAppInstalled = () => {
      console.log("[PWA] App installed successfully");
      setInstallPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const subscribeToPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (sub) return sub;
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
          ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          : undefined,
      });
      setPushSubscribed(true);
      return sub;
    } catch {
      return null;
    }
  }, []);

  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) return true;
      await sub.unsubscribe();
      setPushSubscribed(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const result = await installPrompt.userChoice;
        console.log("[PWA] Install prompt result:", result.outcome);
        setInstallPrompt(null);
        return result.outcome === "accepted";
      } catch {
        return false;
      }
    }
    // Fallback: show manual instructions
    return false;
  }, [installPrompt]);

  return {
    swRegistered,
    pushSubscribed,
    canInstall: !!installPrompt,
    inStandalone,
    platform,
    subscribeToPush,
    unsubscribeFromPush,
    promptInstall,
  };
}

// ── PWA Provider Component ───────────────────────────────────────
export function PwaProvider() {
  const { swRegistered, canInstall, inStandalone, platform, promptInstall } = usePwa();
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  // Read dismissal from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const val = localStorage.getItem(DISMISS_KEY);
      if (val !== "true") {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  if (inStandalone) return null;

  // Show once SW is registered
  if (dismissed || !swRegistered) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {}
  }

  async function handleInstall() {
    if (!canInstall) return;
    setInstalling(true);
    const accepted = await promptInstall();
    if (accepted) {
      dismiss();
    }
    setInstalling(false);
  }

  const isIOS = platform === "ios";
  const isAndroid = platform === "android";

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[9999] mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] p-4 shadow-xl">
        <img
          src="/assets/mark-coral-512.png"
          alt="Mimo"
          className="h-10 w-10 rounded-lg shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {isIOS ? "Install Mimo App" : "Get the App"}
          </p>
          <p className="text-xs text-slate-600">
            {isIOS
              ? "Tap Share  →  Add to Home Screen"
              : isAndroid
                ? canInstall
                  ? "Add to home screen for quick access"
                  : "Add to home screen — preparing…"
                : "Add to home screen for the best experience"}
          </p>
        </div>
        {isAndroid ? (
          canInstall ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {installing ? "..." : "Install"}
            </button>
          ) : (
            <span className="shrink-0 text-xs text-slate-400 animate-pulse">
              ⏳
            </span>
          )
        ) : isIOS ? (
          <button
            onClick={dismiss}
            className="shrink-0 rounded-lg bg-[#007AFF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Got it
          </button>
        ) : (
          <button
            onClick={dismiss}
            className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            OK
          </button>
        )}
        <button
          onClick={dismiss}
          className="shrink-0 text-slate-400 hover:text-slate-600 p-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── BeforeInstallPromptEvent type ────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// ── Standalone push subscription (call after login) ───────────────
// No React hooks needed — call imperatively from auth contexts.

import { API_BASE_URL } from "@/config/api";

export async function subscribeToPushNotifications(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();

    if (!sub) {
      const vapidKey = VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.log("[PWA] No VAPID key configured — skipping push subscribe");
        return;
      }

      const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
      const base64url = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64url);
      const keyBytes = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        keyBytes[i] = rawData.charCodeAt(i);
      }

      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as Uint8Array<ArrayBuffer>,
      });
    }

    // POST to API
    const token = localStorage.getItem("accessToken") || localStorage.getItem("professionalAccessToken");
    if (!token) return;

    await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.toJSON().keys?.p256dh || "",
          auth: sub.toJSON().keys?.auth || "",
        },
        userAgent: navigator.userAgent,
        platform: getPlatform(),
      }),
    });

    console.log("[PWA] Push subscription saved to server");
  } catch (err) {
    console.warn("[PWA] Push subscription failed:", err);
  }
}
