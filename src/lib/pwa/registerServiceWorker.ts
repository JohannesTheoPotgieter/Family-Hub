// Register the PWA service worker + ask for push permission lazily
// (Phase 0.9). Safe to call from app bootstrap — it no-ops in browsers
// that don't support service workers.

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
};

const urlBase64ToBuffer = (base64: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
};

/**
 * Subscribe the active SW registration to web push and POST the
 * subscription up to /api/push/subscribe. The server stores it under the
 * active member's id; subsequent push sends use it directly.
 *
 * Throws when the user denies permission. Caller should treat that as a
 * soft failure — push is opt-in.
 */
export const subscribeToPush = async ({ vapidPublicKey }: { vapidPublicKey: string }) => {
  const registration = await registerServiceWorker();
  if (!registration) return null;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('push permission denied');
  } else if (Notification.permission !== 'granted') {
    throw new Error('push permission previously denied');
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(vapidPublicKey)
    }));

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(subscription.toJSON())
  });

  return subscription;
};
