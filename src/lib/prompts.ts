import type { CheckInStatus, Commitment, Intensity } from "./types";

function openFocus(commitments: Commitment[]) {
  return commitments.find((item) => !item.done)?.title;
}

export function checkInPrompt(commitments: Commitment[], intensity: Intensity) {
  const focus = openFocus(commitments);

  if (intensity === "annoying") {
    if (focus) {
      return `Check in now. Are you still holding ${focus}? Tap on track, slacking, or break.`;
    }
    return "Check in now. Are you on track, slacking, or on a break?";
  }

  if (focus) {
    return `Quick check. Still on ${focus}?`;
  }
  return "Quick check. How are you holding?";
}

/** Short line for speechSynthesis — keeps the commitment name audible. */
export function spokenCheckInPrompt(commitments: Commitment[], intensity: Intensity) {
  const focus = openFocus(commitments);
  if (intensity === "annoying") {
    return focus ? `Check in now. Are you still holding ${focus}?` : "Check in now.";
  }
  return focus ? `Quick check. Still on ${focus}?` : "Quick check. How are you holding?";
}

export function statusLabel(status: CheckInStatus) {
  if (status === "on_track") return "On track";
  if (status === "slacking") return "Slacking";
  return "Break";
}
