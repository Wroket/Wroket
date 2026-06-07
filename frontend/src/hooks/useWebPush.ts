"use client";

import { useCallback, useEffect, useState } from "react";

import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/api/push";
import { getLocalPushSubscription } from "@/lib/webPushLocal";

export type WebPushSupport = "unsupported" | "no-sw" | "ready";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function detectWebPushSupport(): WebPushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return "ready";
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[webPush] service worker registration failed", err);
    return null;
  }
}

/** `accountHasPush`: at least one device subscribed on this account (server flag). */
export function useWebPush(accountHasPush = false) {
  const [localSubscribed, setLocalSubscribed] = useState(false);
  const [localChecked, setLocalChecked] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [support] = useState<WebPushSupport>(() => detectWebPushSupport());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    const sub = await getLocalPushSubscription();
    setLocalSubscribed(sub != null);
    setLocalChecked(true);
    return sub != null;
  }, []);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const enable = useCallback(async () => {
    setError(null);
    if (support !== "ready") {
      setError("unsupported");
      return false;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(perm === "denied" ? "denied" : "default");
        return false;
      }

      const registration = await ensureServiceWorker();
      if (!registration?.pushManager) {
        setError("no-sw");
        return false;
      }

      const vapidKey = await getVapidPublicKey();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      await subscribePush(subscription.toJSON());
      setLocalSubscribed(true);
      setLocalChecked(true);
      return true;
    } catch (err) {
      console.warn("[webPush] enable failed", err);
      setError(err instanceof Error ? err.message : "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [support]);

  const disable = useCallback(async () => {
    setError(null);
    const sub = await getLocalPushSubscription();
    if (!sub) {
      setLocalSubscribed(false);
      return true;
    }

    setBusy(true);
    try {
      await unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
      setLocalSubscribed(false);
      return true;
    } catch (err) {
      console.warn("[webPush] disable failed", err);
      setError(err instanceof Error ? err.message : "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    /** Subscribed on this device. */
    enabled: localSubscribed,
    localSubscribed,
    localChecked,
    accountHasPush,
    otherDeviceOnly: accountHasPush && localChecked && !localSubscribed,
    permission,
    support,
    busy,
    error,
    enable,
    disable,
    refreshLocal,
  };
}
