import { stopNotifications, stopSpeech } from "./speech";

export const LOGOUT_CHANNEL = "hold.logout";

// Clear this app's origin, including data left by older versions.
export async function clearBrowserData() {
  stopSpeech();
  stopNotifications();
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try { window[storage].clear(); } catch { /* Storage can be disabled. */ }
  }
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }

  const cleanups: Promise<unknown>[] = [];
  if ("caches" in window) {
    cleanups.push(window.caches.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key)))));
  }
  if ("serviceWorker" in navigator) {
    cleanups.push(navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      await Promise.all(registrations.map(async (registration) => {
        const notifications = await registration.getNotifications().catch(() => []);
        notifications.forEach((notification) => notification.close());
        await registration.unregister();
      }));
    }));
  }
  if ("indexedDB" in window && typeof window.indexedDB.databases === "function") {
    cleanups.push(window.indexedDB.databases().then((databases) => Promise.all(databases.map(({ name }) => {
      if (!name) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        // Deletion remains queued until other tabs close their connections.
        request.onblocked = () => resolve();
      });
    }))));
  }
  await Promise.allSettled(cleanups);
}

export function broadcastLogout() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(LOGOUT_CHANNEL);
  channel.postMessage("logout");
  channel.close();
}
