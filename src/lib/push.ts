import { api } from './api';

/*
 * Web Push subscription + app-icon badge helpers.
 *
 * enableWebPush() asks for notification permission, subscribes the service
 * worker with the VAPID public key, and stores the subscription on the
 * account through the API. updateBadge() mirrors the unread notification
 * count onto the installed app's icon (Badging API; Android/desktop —
 * iOS home-screen badges are not supported for web apps).
 */

const DENIED_KEY = 'waraqpro.push.denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** One-time guard so a rejected permission is never re-prompted this session. */
let attempted = false;

export async function enableWebPush(lang: 'ar' | 'en'): Promise<void> {
  try {
    const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window)) return;
    if (attempted) return;
    try {
      if (localStorage.getItem(DENIED_KEY) === '1') return;
    } catch {
      /* storage unavailable */
    }
    attempted = true;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      // Denied on purpose: remember so we never nag again this browser.
      try {
        localStorage.setItem(DENIED_KEY, '1');
      } catch {
        /* ignore */
      }
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));

    await api('/api/push', {
      method: 'POST',
      body: { action: 'subscribe', subscription: subscription.toJSON(), lang },
    });
  } catch {
    /* push is best effort: never break the page over it */
  }
}

/** Mirrors the unread notification count onto the installed app icon. */
export function updateBadge(count: number): void {
  try {
    const set = (
      navigator as Navigator & { setAppBadge?: (n?: number) => void; clearAppBadge?: () => void }
    );
    if (count > 0) set.setAppBadge?.(count);
    else set.clearAppBadge?.();
  } catch {
    /* badge unsupported (e.g. iOS home-screen web apps) */
  }
}
