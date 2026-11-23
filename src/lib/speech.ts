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
    utterance.onerror = () => reject(new Error("Speech was interrupted."));
    window.speechSynthesis.speak(utterance);
  });
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "hold-check-in" });
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
