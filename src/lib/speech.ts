const activeNotifications = new Set<Notification>();

export function stopNotifications() {
  activeNotifications.forEach((notification) => notification.close());
  activeNotifications.clear();
}

export function stopSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.reject(new Error("Speech is not available in this browser."));
  }

  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;

  return new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(new Error(event.error === "not-allowed"
      ? "Your browser blocked speech. Tap Say the time to enable it."
      : `Couldn’t speak (${event.error}). Try Say the time.`));
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  });
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, { body, tag: "hold-check-in" });
    activeNotifications.add(notification);
    notification.onclose = () => activeNotifications.delete(notification);
  } catch {
    // Ignore browsers that block Notification construction.
  }
}

export async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}
