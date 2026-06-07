/** Local Web Push subscription state for this browser / PWA install. */

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration?.pushManager) return null;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function hasLocalWebPushSubscription(): Promise<boolean> {
  const sub = await getLocalPushSubscription();
  return sub != null;
}
